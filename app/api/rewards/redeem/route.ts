import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

import { withMetrics } from '@/lib/api-metrics';
// POST /api/rewards/redeem - Redeem points for voucher
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
    const { voucherId, pointsCost, voucherData } = body;

    if (!voucherId || !pointsCost || !voucherData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify voucher template exists and is enabled
    const templateSnap = await adminDb.collection('voucherTemplates').doc(voucherId).get();
    
    if (!templateSnap.exists) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });
    }

    const template = templateSnap.data();
    
    if (!template?.enabled) {
      return NextResponse.json({ error: 'Voucher is no longer available' }, { status: 400 });
    }

    // Verify points cost matches template (prevent tampering)
    if (template.pointsCost !== pointsCost) {
      return NextResponse.json({ error: 'Invalid points cost' }, { status: 400 });
    }

    // Get user's current balance
    const userRef = adminDb.collection('users').doc(userUid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userSnap.data();
    const currentBalance = userData?.points || 0;

    if (currentBalance < pointsCost) {
      return NextResponse.json({ 
        error: 'Insufficient points',
        required: pointsCost,
        current: currentBalance
      }, { status: 400 });
    }

    // Generate unique voucher code
    const voucherCode = `JOY${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + template.expiryDays);

    // Create voucher document with all template data
    const voucherDoc = {
      userId: userUid,
      voucherId,
      code: voucherCode,
      name: template.name,
      description: template.description,
      discountType: template.discountType,
      discountValue: template.discountValue,
      category: template.category,
      minPurchase: template.minPurchase || 0,
      maxDiscount: template.maxDiscount || null,
      pointsCost,
      redeemedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      used: false,
      usedAt: null
    };

    // Save voucher
    await adminDb.collection('vouchers').add(voucherDoc);

    // Deduct points from user
    await userRef.update({
      points: currentBalance - pointsCost,
      lastActivity: new Date().toISOString()
    });

    // Log transaction
    // Log to New Transaction Ledger (User Subcollection)
    await adminDb.collection('users').doc(userUid).collection('transactions').add({
      type: 'SPEND',
      amount: pointsCost,
      source: 'REWARD_REDEMPTION',
      description: `Redeemed ${template.name}`,
      metadata: { voucherId, voucherCode, pointsCost },
      timestamp: FieldValue.serverTimestamp()
    });


    return NextResponse.json({
      success: true,
      code: voucherCode,
      expiresAt: expiresAt.toISOString(),
      newBalance: currentBalance - pointsCost,
      minPurchase: template.minPurchase
    });

  } catch (error: any) {
    console.error('Error redeeming voucher:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
