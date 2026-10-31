import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// GET /api/rewards/my-vouchers - Get user's redeemed vouchers
export const GET = withMetrics(async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userUid = decodedToken.uid;

    // Fetch user's vouchers (only unused ones)
    const vouchersSnap = await adminDb
      .collection('vouchers')
      .where('userId', '==', userUid)
      .where('used', '==', false)
      .get();

    const vouchers = vouchersSnap.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .sort((a: any, b: any) => {
        // Sort by redeemedAt in descending order (newest first)
        const aTime = a.redeemedAt?.toMillis?.() || 0;
        const bTime = b.redeemedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

    return NextResponse.json({ vouchers });

  } catch (error: any) {
    console.error('Error fetching vouchers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
