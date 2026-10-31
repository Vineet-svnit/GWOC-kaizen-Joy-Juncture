import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { headers } from 'next/headers';

import { withMetrics } from '@/lib/api-metrics';
// POST /api/user/unlock-tier - Purchase tier unlock with JP
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const authorization = headersList.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1];
    let decodedToken;
    
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userUid = decodedToken.uid;
    const { tierName, price, xpGrant } = await req.json();

    if (!tierName || !price || !xpGrant) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(userUid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userSnap.data();
    const currentXP = userData?.xp || 0;
    const currentPoints = userData?.points || 0;

    // Check if user already has this tier
    if (currentXP >= xpGrant) {
      return NextResponse.json({ 
        error: 'You already have this tier or higher!' 
      }, { status: 400 });
    }

    // Check if user has enough JP
    if (currentPoints < price) {
      return NextResponse.json({ 
        error: `Insufficient JP. You need ${price.toLocaleString()} JP but have ${currentPoints.toLocaleString()} JP.` 
      }, { status: 400 });
    }

    // Deduct JP and grant XP
    await userRef.set({
      xp: xpGrant, // Set XP to tier minimum
      points: currentPoints - price, // Deduct JP
      lastTierUnlock: new Date().toISOString(),
      unlockedTiers: FieldValue.arrayUnion(tierName)
    }, { merge: true });

    // Log transaction
    await userRef.collection('transactions').add({
      type: 'tier_unlock',
      tierName,
      jpSpent: price,
      xpGranted: xpGrant,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: `${tierName} tier unlocked!`,
      newXP: xpGrant,
      newBalance: currentPoints - price
    });

  } catch (error: any) {
    console.error('Error unlocking tier:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
);
