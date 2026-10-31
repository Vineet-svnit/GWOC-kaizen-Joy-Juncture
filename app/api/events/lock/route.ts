import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { withMetrics } from '@/lib/api-metrics';
// Lock duration in minutes
const LOCK_DURATION_MINUTES = 10;

export const POST = withMetrics(async function POST(request: NextRequest) {
  try {
    let body;
    try {
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse JSON body:', text);
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
      }
    } catch(e) { body = {} }

    // console.log('Lock POST Body:', JSON.stringify(body, null, 2));
    const { eventId, userId } = body;

    if (!eventId || !userId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing eventId or userId' 
        },
        { status: 400 }
      );
    }

    // 1. Check if user already has a lock for this event
    const locksRef = adminDb.collection('event_locks');
    const userLockSnap = await locksRef
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .get();
    
    const now = new Date();
    let existingLockId = null;
    
    userLockSnap.forEach(doc => {
      const data = doc.data();
      const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toDate() : new Date(data.expiresAt); 
      if (expiresAt > now) {
        existingLockId = doc.id;
      }
    });

    if (existingLockId) {
      return NextResponse.json({
        success: true,
        lockId: existingLockId,
        message: 'Existing valid lock found'
      });
    }

    // 2. Check Event Capacity
    const eventRef = adminDb.collection('events').doc(eventId);
    const eventSnap = await eventRef.get();
    
    if (!eventSnap.exists) {
      return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
    }
    
    const eventData = eventSnap.data();
    const capacity = eventData?.capacity || 0;
    const registeredCount = eventData?.registered || 0;

    // 3. Count Active Locks
    const activeLocksSnap = await locksRef
      .where('eventId', '==', eventId)
      .where('expiresAt', '>', Timestamp.fromDate(now))
      .get();
      
    const activeLocksCount = activeLocksSnap.size;

    // 4. Verify Availability
    const availableSpots = capacity - registeredCount - activeLocksCount;

    if (availableSpots <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Event is momentarily full due to active transactions. Please try again in a few minutes.'
      }, { status: 409 }); // 409 Conflict
    }

    // 5. Create New Lock
    const expiresAt = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60000);
    
    const newLock = await locksRef.add({
      eventId,
      userId,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt)
    });

    return NextResponse.json({
      success: true,
      lockId: newLock.id,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error: any) {
    console.error('Lock creation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create lock' },
      { status: 500 }
    );
  }
}
);

export const DELETE = withMetrics(async function DELETE(request: NextRequest) {
  try {
    const { lockId, eventId, userId } = await request.json();
    const locksRef = adminDb.collection('event_locks');

    if (lockId) {
      await locksRef.doc(lockId).delete();
      return NextResponse.json({ success: true });
    }

    if (eventId && userId) {
      const snapshot = await locksRef
        .where('eventId', '==', eventId)
        .where('userId', '==', userId)
        .get();
        
      const batch = adminDb.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
  } catch (error: any) {
    console.error('Lock release error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
);
