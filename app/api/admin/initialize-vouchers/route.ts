import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { headers } from 'next/headers';

import { withMetrics } from '@/lib/api-metrics';
// POST /api/admin/initialize-vouchers - Initialize default vouchers
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

    // Check if user is admin
    const userRef = adminDb.collection('users').doc(decodedToken.uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists || (!userSnap.data()?.isAdmin && userSnap.data()?.role !== 'admin')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Default vouchers to initialize
    const defaultVouchers = [
      {
        id: 'voucher_welcome_10',
        name: '10% Welcome Discount',
        description: 'Get 10% off on your first purchase',
        pointsCost: 500,
        discountType: 'percentage',
        discountValue: 10,
        icon: '🎉',
        color: 'from-blue-500 to-cyan-500',
        category: 'shop',
        expiryDays: 30,
        minPurchase: 500,
        maxDiscount: 200,
        enabled: true
      },
      {
        id: 'voucher_shop_20',
        name: '20% Shop Discount',
        description: 'Save 20% on all shop purchases',
        pointsCost: 1000,
        discountType: 'percentage',
        discountValue: 20,
        icon: '🛍️',
        color: 'from-purple-500 to-pink-500',
        category: 'shop',
        expiryDays: 30,
        minPurchase: 1000,
        maxDiscount: 500,
        enabled: true
      },
      {
        id: 'voucher_flat_100',
        name: '₹100 Flat Discount',
        description: 'Get flat ₹100 off on any purchase',
        pointsCost: 800,
        discountType: 'fixed',
        discountValue: 100,
        icon: '💰',
        color: 'from-green-500 to-emerald-500',
        category: 'shop',
        expiryDays: 30,
        minPurchase: 500,
        enabled: true
      },
      {
        id: 'voucher_event_15',
        name: '15% Event Discount',
        description: 'Save 15% on event registrations',
        pointsCost: 750,
        discountType: 'percentage',
        discountValue: 15,
        icon: '🎫',
        color: 'from-orange-500 to-red-500',
        category: 'events',
        expiryDays: 30,
        minPurchase: 300,
        maxDiscount: 300,
        enabled: true
      },
      {
        id: 'voucher_experience_25',
        name: '25% Experience Discount',
        description: 'Huge discount on gaming experiences',
        pointsCost: 1500,
        discountType: 'percentage',
        discountValue: 25,
        icon: '🎮',
        color: 'from-yellow-500 to-orange-500',
        category: 'experiences',
        expiryDays: 30,
        minPurchase: 1000,
        maxDiscount: 750,
        enabled: true
      },
      {
        id: 'voucher_mega_200',
        name: '₹200 Mega Discount',
        description: 'Massive ₹200 off on big purchases',
        pointsCost: 1800,
        discountType: 'fixed',
        discountValue: 200,
        icon: '🔥',
        color: 'from-indigo-500 to-purple-500',
        category: 'shop',
        expiryDays: 30,
        minPurchase: 1500,
        enabled: true
      }
    ];

    // Save vouchers to Firestore
    const vouchersRef = adminDb.collection('voucherTemplates');
    const batch = adminDb.batch();

    for (const voucher of defaultVouchers) {
      const docRef = vouchersRef.doc(voucher.id);
      batch.set(docRef, {
        ...voucher,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `${defaultVouchers.length} default vouchers initialized successfully!`,
      vouchers: defaultVouchers
    });

  } catch (error: any) {
    console.error('Error initializing vouchers:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
);

// GET /api/admin/initialize-vouchers - Check initialization status
export const GET = withMetrics(async function GET(req: NextRequest) {
  try {
    const vouchersRef = adminDb.collection('voucherTemplates');
    const snapshot = await vouchersRef.limit(1).get();

    return NextResponse.json({
      initialized: !snapshot.empty,
      count: snapshot.size
    });

  } catch (error: any) {
    console.error('Error checking vouchers:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
);
