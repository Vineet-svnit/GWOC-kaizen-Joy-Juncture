import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Request
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    if (!userId) {
      return NextResponse.json({ error: 'Invalid User' }, { status: 400 });
    }

    // 2. Fetch Existing Transactions to prevent duplicates
    const transactionsSnap = await adminDb.collection('users').doc(userId).collection('transactions').get();
    const existingTransactionKeys = new Set();
    transactionsSnap.forEach(doc => {
      const data = doc.data();
      // Create unique keys for deduplication
      if (data.metadata?.orderId) {
        if (data.type === 'SPEND') {
          existingTransactionKeys.add(`ORDER_SPEND_${data.metadata.orderId}`);
        } else {
          existingTransactionKeys.add(`ORDER_${data.metadata.orderId}`);
        }
      }
      if (data.metadata?.registrationId) {
        if (data.type === 'SPEND') {
           existingTransactionKeys.add(`EVENT_SPEND_${data.metadata.registrationId}`);
        } else {
           existingTransactionKeys.add(`EVENT_${data.metadata.registrationId}`);
        }
      }
      if (data.metadata?.gameId && data.metadata?.playedAt) existingTransactionKeys.add(`GAME_${data.metadata.gameId}_${data.metadata.playedAt}`);
      if (data.metadata?.gameId && data.timestamp) {
         // Fallback for game plays that used timestamp as ID conceptually
         // Converting firestore timestamp to date string might be tricky for exact matching, 
         // but we'll try to use available unique IDs.
      }
      if (data.metadata?.voucherId) {
        existingTransactionKeys.add(`VOUCHER_SPEND_${data.metadata.voucherId}`);
      }
    });

    const newTransactions: any[] = [];

    // 3. Backfill from Orders
    const ordersSnap = await adminDb.collection('orders').where('userId', '==', userId).get();
    ordersSnap.forEach(doc => {
      const order = doc.data();
      console.log(`[Backfill] Order ${doc.id}: totalPoints=${order.totalPoints}, pointsRedeemed=${order.pointsRedeemed}`); // Debug Log

      if (!existingTransactionKeys.has(`ORDER_${doc.id}`) && order.totalPoints > 0) {
        newTransactions.push({
          type: 'EARN',
          amount: order.totalPoints,
          source: 'SHOP_PURCHASE',
          description: 'Shop Purchase Reward (Backfilled)',
          metadata: { orderId: doc.id, purchaseAmount: order.totalPrice, backfilled: true },
          timestamp: order.createdAt || FieldValue.serverTimestamp()
        });
      }

      const spendKey = `ORDER_SPEND_${doc.id}`;
      if (!existingTransactionKeys.has(spendKey) && order.pointsRedeemed > 0) {
        // Double check against transactions loop if we missed it or store spcific key
        // We need check against 'existingTransactionKeys' which we populated. 
        // We need to add 'ORDER_SPEND_' check in step 2 if we want true reliability, 
        // but for now relying on this new key is fine as we didn't add it in step 2 yet.
        
        newTransactions.push({
          type: 'SPEND',
          amount: order.pointsRedeemed,
          source: 'SHOP_REDEMPTION',
          description: 'Points Redeemed on Order (Backfilled)',
          metadata: { orderId: doc.id, backfilled: true },
          timestamp: order.createdAt || FieldValue.serverTimestamp()
        });
      }
    });

    // 4. Backfill from Event Registrations
    const eventsSnap = await adminDb.collection('event_registrations').where('userId', '==', userId).get();
    eventsSnap.forEach(doc => {
      const reg = doc.data();
      // Estimate points if not explicitly stored (using default 50 base + 10 per 100 calc logic roughly)
      // Or safer: just check if 'walletPointsUsed' (SPEND) or implied EARN?
      // The register route logic awards points but doesn't store them on the registration doc itself explicitly usually.
      // But we can check user Points history if we had it. Since we don't, we might default to a safe value or skip if uncertain.
      // However, usually "EARN" is the missing part. 
      // Let's look for known fields. If missing, we might skip to avoid bad data, OR user specific logic:
      // "Event Registration" usually gives 50 + (price/100)*10.
      
      const amountPaid = reg.amountPaid || reg.amount || 0;
      // Re-calculate basic estimated points
      const estimatedPoints = 50 + Math.floor((amountPaid / 100) * 10);

      // 4a. EARN Transaction
      if (!existingTransactionKeys.has(`EVENT_${doc.id}`)) {
        newTransactions.push({
          type: 'EARN',
          amount: estimatedPoints, // Best effort backfill
          source: 'EVENT_REGISTRATION',
          description: 'Event Registration Reward (Backfilled)',
          metadata: { registrationId: doc.id, eventId: reg.eventId, amountPaid, backfilled: true },
          timestamp: reg.createdAt || FieldValue.serverTimestamp()
        });
      }

      // 4b. SPEND Transaction (if they used wallet points)
      if (reg.walletPointsUsed > 0 && !existingTransactionKeys.has(`EVENT_SPEND_${doc.id}`)) {
         // We didn't add this key to set yet, but logic is similar
         newTransactions.push({
          type: 'SPEND',
          amount: reg.walletPointsUsed,
          source: 'EVENT_REGISTRATION',
          description: 'Used points for Event',
          metadata: { registrationId: doc.id, eventId: reg.eventId, backfilled: true },
          timestamp: reg.createdAt || FieldValue.serverTimestamp()
        });
      }
    });

    // 5. Backfill from Game Plays
    const gamesSnap = await adminDb.collection('users').doc(userId).collection('gamePlays').get();
    gamesSnap.forEach(doc => {
      const play = doc.data();
      const playId = doc.id; // usually gameId_date
      
      // The gamePlays collection structure: { gameId, pointsAwarded, playedAt, ... }
      // The doc ID is often `gameId_YYYY-MM-DD`.
      
      // Deduplication key:
      const uniqueKey = `GAME_${play.gameId}_${play.playedAt}`;
      
      if (!existingTransactionKeys.has(uniqueKey) && play.pointsAwarded > 0) {
        // Note: 'pointsAwarded' in gamePlays is often base points. 
        // Real JP awarded included multiplier. 
        // We might not know the multiplier at that time `tierMultiplier` might not be stored.
        // We'll trust `pointsAwarded` or estimate. 
        // Actually `app/api/games/claim/route.ts` saves `points` (JP) to user balance.
        // It *doesn't* seemingly save the final JP amount to `gamePlays` doc explicitly in the `set`?
        // Wait, `playRecordRef.set({... pointsAwarded: finalPoints ...})`. 
        // `finalPoints` was BEFORE multiplier in the code I read earlier? 
        // Let's re-read line 52 vs 112 in claim route.
        // Claim route: `finalPoints` (base - penalty). `jpEarned = finalPoints * multiplier`.
        // So `gamePlays` has raw points. 
        // We will underestimate if we use raw points, but cleaner than overestimating.
        // OR we try to fetch current tier (might be wrong for past).
        // Let's stick to `pointsAwarded` as a safe minimum, marking as backfilled.
        
        newTransactions.push({
          type: 'EARN',
          amount: play.pointsAwarded, 
          source: 'Game Award',
          description: `Won ${play.gameId || 'Game'} (Backfilled)`,
          metadata: { gameId: play.gameId, playId: doc.id, backfilled: true, playedAt: play.playedAt },
          timestamp: play.playedAt ? new Date(play.playedAt) : FieldValue.serverTimestamp()
        });
      }
    });

    // 6. Backfill from Vouchers (Global 'vouchers' collection)
    const vouchersSnap = await adminDb.collection('vouchers').where('userId', '==', userId).get();
    vouchersSnap.forEach(doc => {
      const voucher = doc.data();
      const spendKey = `VOUCHER_SPEND_${doc.id}`;
      
      // Only backfill if we have a cost and it's not already logged
      if (!existingTransactionKeys.has(spendKey) && voucher.pointsCost > 0) {
        newTransactions.push({
          type: 'SPEND',
          amount: voucher.pointsCost,
          source: 'REWARD_REDEMPTION',
          description: `Redeemed ${voucher.name || 'Voucher'} (Backfilled)`,
          metadata: { voucherId: doc.id, code: voucher.code, backfilled: true },
          timestamp: voucher.redeemedAt ? new Date(voucher.redeemedAt) : FieldValue.serverTimestamp()
        });
        existingTransactionKeys.add(spendKey);
      }
    });

    // 6. Backfill from Legacy Point History (users/{userId}->pointHistory array)
    // This is CRITICAL for recovering "Points Redeemed" which were NOT stored in the orders collection previously.
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const legacyHistory = userData?.pointHistory || [];

    legacyHistory.forEach((entry: any) => {
      // Logic for Redemptions
      // Entry format: { date, points: -500, activity: 'Points redeemed for purchase', orderId: '...' }
      if (entry.activity === 'Points redeemed for purchase' && entry.points < 0 && entry.orderId) {
        const spendKey = `ORDER_SPEND_${entry.orderId}`;
        const pointsSpent = Math.abs(entry.points);

        if (!existingTransactionKeys.has(spendKey)) {
          newTransactions.push({
            type: 'SPEND',
            amount: pointsSpent,
            source: 'SHOP_REDEMPTION',
            description: 'Points Redeemed on Order (Restored)',
            metadata: { orderId: entry.orderId, backfilled: true, source: 'legacy_history' },
            timestamp: entry.date ? new Date(entry.date) : FieldValue.serverTimestamp()
          });
          // Add to set to prevent double adding if order logic above caught it (unlikely given the bug)
          existingTransactionKeys.add(spendKey);
        }
      }
    });

    // 7. Batch Write (Chunks of 500)
    if (newTransactions.length > 0) {
      const batchSize = 500;
      const batches = [];
      
      for (let i = 0; i < newTransactions.length; i += batchSize) {
        const batch = adminDb.batch();
        const chunk = newTransactions.slice(i, i + batchSize);
        
        chunk.forEach(tx => {
          const ref = adminDb.collection('users').doc(userId).collection('transactions').doc();
          batch.set(ref, tx);
        });
        
        batches.push(batch.commit());
      }
      
      await Promise.all(batches);
    }

    return NextResponse.json({ 
      success: true, 
      backfilledCount: newTransactions.length,
      message: `Successfully backfilled ${newTransactions.length} transactions` 
    });

  } catch (error: any) {
    console.error('Backfill Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
);
