import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { headers } from 'next/headers';

import { withMetrics } from '@/lib/api-metrics';
// GET /api/user/tier-perks - Get user's tier and available perks
export const GET = withMetrics(async function GET(req: NextRequest) {
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
    const userRef = adminDb.collection('users').doc(userUid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userSnap.data();
    const xp = userData?.xp || 0;
    
    // Get tier configuration
    const settingsSnap = await adminDb.doc('settings/xpSystem').get();
    const TIERS = settingsSnap.exists && settingsSnap.data()?.tiers ? settingsSnap.data()!.tiers : [
      { name: 'Newbie', minXP: 0, multiplier: 1.0, perk: 'None' },
      { name: 'Player', minXP: 500, multiplier: 1.1, perk: 'Early access to Event Tickets' },
      { name: 'Strategist', minXP: 2000, multiplier: 1.25, perk: '5% off all Workshops' },
      { name: 'Grandmaster', minXP: 5000, multiplier: 1.5, perk: 'VIP Seating at Game Nights' }
    ];
    
    const currentTier = [...TIERS].reverse().find((tier: any) => xp >= tier.minXP) || TIERS[0];
    
    // Calculate perks
    const perks = {
      earlyEventAccess: xp >= 500,
      workshopDiscount: xp >= 2000 ? 5 : 0,
      vipSeating: xp >= 5000,
      tierMultiplier: currentTier.multiplier
    };

    return NextResponse.json({
      success: true,
      xp,
      tier: currentTier,
      perks
    });

  } catch (error: any) {
    console.error('Error fetching tier perks:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
);
