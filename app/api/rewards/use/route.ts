import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// POST /api/rewards/use - Mark voucher as used after successful payment
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userUid = decodedToken.uid;

    const body = await req.json();
    const { voucherId, orderId } = body;

    if (!voucherId) {
      return NextResponse.json({ error: 'Voucher ID required' }, { status: 400 });
    }

    // Get voucher document
    const voucherRef = adminDb.collection('vouchers').doc(voucherId);
    const voucherSnap = await voucherRef.get();

    if (!voucherSnap.exists) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });
    }

    const voucher = voucherSnap.data();

    // Verify ownership
    if (voucher?.userId !== userUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Mark as used
    await voucherRef.update({
      used: true,
      usedAt: new Date().toISOString(),
      orderId: orderId || null
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error marking voucher as used:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
