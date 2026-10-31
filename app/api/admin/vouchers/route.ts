import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// GET /api/admin/vouchers - Get all voucher templates
export const GET = withMetrics(async function GET(req: NextRequest) {
  try {
    const vouchersSnap = await adminDb.collection('voucherTemplates').get();
    const vouchers = vouchersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ vouchers });
  } catch (error: any) {
    console.error('Error fetching vouchers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);

// POST /api/admin/vouchers - Create/Update voucher template
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Check if user is admin
    const userRef = adminDb.collection('users').doc(decodedToken.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    
    if (!userData?.isAdmin && userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { id, ...voucherData } = body;

    await adminDb.collection('voucherTemplates').doc(id).set({
      ...voucherData,
      updatedAt: new Date().toISOString(),
      updatedBy: decodedToken.email
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving voucher:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);

// DELETE /api/admin/vouchers - Delete voucher template
export const DELETE = withMetrics(async function DELETE(req: NextRequest) {
  try {
    const authorization = req.headers.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Check if user is admin
    const userRef = adminDb.collection('users').doc(decodedToken.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    
    if (!userData?.isAdmin && userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    await adminDb.collection('voucherTemplates').doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting voucher:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
