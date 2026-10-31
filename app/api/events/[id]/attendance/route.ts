import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if user is registered for this event
    const registrationQuery = await db
      .collection('event_registrations')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .where('status', '==', 'registered')
      .get();

    const attended = !registrationQuery.empty;

    return NextResponse.json({
      success: true,
      attended,
    });
  } catch (error) {
    console.error('Error checking attendance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check attendance' },
      { status: 500 }
    );
  }
}
);