import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    console.log(`Clearing history for user: ${userId}`);

    // Delete orders
    const ordersSnapshot = await adminDb.collection('orders').where('userId', '==', userId).get();
    console.log(`Found ${ordersSnapshot.size} orders to delete`);
    
    if (!ordersSnapshot.empty) {
      const orderBatch = adminDb.batch();
      ordersSnapshot.docs.forEach(doc => {
        orderBatch.delete(doc.ref);
      });
      await orderBatch.commit();
    }

    // Delete event registrations
    const registrationsSnapshot = await adminDb.collection('event_registrations').where('userId', '==', userId).get();
    console.log(`Found ${registrationsSnapshot.size} registrations to delete`);

    if (!registrationsSnapshot.empty) {
      const regBatch = adminDb.batch();
      registrationsSnapshot.docs.forEach(doc => {
        regBatch.delete(doc.ref);
      });
      await regBatch.commit();
    }

    // Also delete payment_orders if any
    const paymentsSnapshot = await adminDb.collection('payment_orders').where('userId', '==', userId).get();
    console.log(`Found ${paymentsSnapshot.size} payment orders to delete`);

    if (!paymentsSnapshot.empty) {
      const payBatch = adminDb.batch();
      paymentsSnapshot.docs.forEach(doc => {
        payBatch.delete(doc.ref);
      });
      await payBatch.commit();
    }

    return NextResponse.json({ 
      success: true, 
      message: 'History cleared',
      deleted: {
        orders: ordersSnapshot.size,
        registrations: registrationsSnapshot.size,
        payments: paymentsSnapshot.size
      }
    });
  } catch (error: any) {
    console.error('Error clearing history:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
);
