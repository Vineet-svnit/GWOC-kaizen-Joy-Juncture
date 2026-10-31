import { NextRequest, NextResponse } from 'next/server';
import { registerForEvent } from '@/lib/db/registrations';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(request: NextRequest) {
  try {
    const { eventId, userId } = await request.json();

    if (!eventId || !userId) {
      return NextResponse.json(
        { success: false, error: 'Missing eventId or userId' },
        { status: 400 }
      );
    }

    const result = await registerForEvent(eventId, userId);

    return NextResponse.json({
      success: result.success,
      waitlisted: result.waitlisted,
      message: result.message,
      eventId,
      userId,
      registrationId: result.registrationId,
      alreadyRegistered: result.alreadyRegistered || false,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Registration failed',
        message: error.message 
      },
      { status: 500 }
    );
  }
}
);
