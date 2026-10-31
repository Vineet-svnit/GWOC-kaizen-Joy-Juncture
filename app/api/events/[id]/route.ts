import { NextRequest, NextResponse } from 'next/server';
import { getEventById, updateEventById, deleteEventById } from '@/lib/db/events';
import { auth, db } from '@/lib/firebase-admin'
export const GET = withMetrics(async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        
        import { withMetrics } from '@/lib/api-metrics';
// Use Admin SDK to fetch event data ensures fresh data and bypasses client cache
        const eventDoc = await db.collection('events').doc(id).get();
        
        if (!eventDoc.exists) {
            return NextResponse.json(
                { success: false, error: "Event not found" },
                { status: 404 }
            );
        }

        const data = eventDoc.data();
        const event: any = {
            id: eventDoc.id,
            ...data,
            datetime: data?.datetime?.toDate(),
            createdAt: data?.createdAt?.toDate(),
            updatedAt: data?.updatedAt?.toDate(),
        };

        // Calculate active locks to determine true availability
        let availableSlots = event.capacity - event.registered;
        let activeLocksCount = 0;

        try {
            const locksRef = db.collection('event_locks');
            const now = new Date();
            const activeLocksSnap = await locksRef
                .where('eventId', '==', id)
                .where('expiresAt', '>', now) // Assuming expiresAt is stored as compatible type (Timestamp or Date)
                .get();
            
            activeLocksCount = activeLocksSnap.size;
            availableSlots = Math.max(0, availableSlots - activeLocksCount);
        } catch (lockError) {
            console.error("Error fetching event locks:", lockError);
            // Fallback to basic availability if lock check fails
        }

        return NextResponse.json({
            success: true,
            event,
            availableSlots,
            activeLocks: activeLocksCount
        });
    } catch (error) {
        console.error("Error fetching event:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
);


export const PATCH = withMetrics(async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    /* ---------------- AUTH ---------------- */
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = await auth.verifyIdToken(token);

    /* ---------------- ROLE CHECK (DB) ---------------- */
    const userSnap = await db
      .collection('users')
      .doc(decoded.uid)
      .get();

    if (!userSnap.exists || userSnap.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    /* ---------------- UPDATE ---------------- */
    const updates = await request.json();

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No update data provided' },
        { status: 400 }
      );
    }

    const updatedEvent = await updateEventById(id, updates);

    if (!updatedEvent) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      event: updatedEvent,
    });
  } catch (error) {
    console.error('Error updating event:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
);

export const DELETE = withMetrics(async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    /* ---------------- AUTH ---------------- */
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = await auth.verifyIdToken(token);

    /* ---------------- ROLE CHECK (DB) ---------------- */
    const userSnap = await db
      .collection('users')
      .doc(decoded.uid)
      .get();

    if (!userSnap.exists || userSnap.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    /* ---------------- DELETE ---------------- */
    const success = await deleteEventById(id);

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete event' },
      { status: 500 }
    );
  }
}
);
