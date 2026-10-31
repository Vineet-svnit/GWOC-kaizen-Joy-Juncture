import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// POST /api/rewards/validate - Validate voucher code and calculate discount
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
    const { code, orderTotal, category } = body;

    if (!code || orderTotal === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find voucher by code
    const vouchersSnap = await adminDb
      .collection('vouchers')
      .where('code', '==', code.toUpperCase())
      .limit(1)
      .get();

    if (vouchersSnap.empty) {
      return NextResponse.json({ 
        error: 'Invalid voucher code',
        valid: false
      }, { status: 404 });
    }

    const voucherDoc = vouchersSnap.docs[0];
    const voucher = voucherDoc.data();

    // Validation checks
    const validationErrors: string[] = [];

    // 1. Check if voucher belongs to user
    if (voucher.userId !== userUid) {
      validationErrors.push('This voucher does not belong to you');
    }

    // 2. Check if already used
    if (voucher.used) {
      validationErrors.push('This voucher has already been used');
    }

    // 3. Check if expired
    const now = new Date();
    const expiryDate = new Date(voucher.expiresAt);
    if (now > expiryDate) {
      validationErrors.push('This voucher has expired');
    }

    // 4. Check category match (if specified)
    // Vouchers with category "all" can be used anywhere
    if (category && voucher.category !== 'all' && voucher.category !== category) {
      validationErrors.push(`This voucher can only be used for ${voucher.category}`);
    }

    // 5. Check minimum purchase requirement
    if (voucher.minPurchase && orderTotal < voucher.minPurchase) {
      validationErrors.push(`Minimum purchase of ₹${voucher.minPurchase} required`);
    }

    if (validationErrors.length > 0) {
      return NextResponse.json({
        valid: false,
        error: validationErrors[0],
        errors: validationErrors
      }, { status: 400 });
    }

    // Calculate discount
    let discountAmount = 0;

    if (voucher.discountType === 'percentage') {
      discountAmount = (orderTotal * voucher.discountValue) / 100;
      
      // Apply max discount cap if specified
      if (voucher.maxDiscount && discountAmount > voucher.maxDiscount) {
        discountAmount = voucher.maxDiscount;
      }
    } else {
      // Fixed discount
      discountAmount = voucher.discountValue;
    }

    // Ensure discount doesn't exceed order total
    if (discountAmount > orderTotal) {
      discountAmount = orderTotal;
    }

    const finalAmount = orderTotal - discountAmount;

    return NextResponse.json({
      valid: true,
      voucherId: voucherDoc.id,
      voucher: {
        code: voucher.code,
        name: voucher.name,
        description: voucher.description,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue
      },
      discount: {
        amount: Math.round(discountAmount * 100) / 100,
        percentage: Math.round((discountAmount / orderTotal) * 100)
      },
      orderTotal,
      finalAmount: Math.round(finalAmount * 100) / 100,
      savings: Math.round(discountAmount * 100) / 100
    });

  } catch (error: any) {
    console.error('Error validating voucher:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
