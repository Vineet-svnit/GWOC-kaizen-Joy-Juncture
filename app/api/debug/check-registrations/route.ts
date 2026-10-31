import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    console.log(`Checking registrations for user: ${userId}`);

    // Get all registrations for user
    const registrationsSnapshot = await adminDb.collection('event_registrations')
      .where('userId', '==', userId)
      .get();

    const registrations = registrationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Get all events to match names
    const eventsSnapshot = await adminDb.collection('events').get();
    const events = eventsSnapshot.docs.reduce((acc: any, doc) => {
      acc[doc.id] = doc.data();
      return acc;
    }, {});

    // Combine data
    const result = registrations.map((reg: any) => ({
      registrationId: reg.id,
      eventId: reg.eventId,
      eventName: events[reg.eventId]?.title || 'Unknown Event',
      status: reg.status,
      paymentStatus: reg.paymentStatus,
      amountPaid: reg.amountPaid,
      amount: reg.amount,
      createdAt: reg.createdAt?.toDate?.() || reg.createdAt,
      timestamp: reg.timestamp?.toDate?.() || reg.timestamp,
    }));

    return NextResponse.json({ 
      success: true, 
      count: result.length,
      registrations: result,
      rawRegistrations: registrations // Include raw data for debugging
    });
  } catch (error: any) {
    console.error('Error checking registrations:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
);
