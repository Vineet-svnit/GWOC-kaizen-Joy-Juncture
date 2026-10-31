import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase-admin';
import { EventTestimonial } from '@/lib/types';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;

    // Authenticate user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = await auth.verifyIdToken(token);
    const userId = decoded.uid;

    // Check if user is registered for this event
    const registrationQuery = await db
      .collection('event_registrations')
      .where('eventId', '==', eventId)
      .where('userId', '==', userId)
      .where('status', '==', 'registered')
      .get();

    if (registrationQuery.empty) {
      return NextResponse.json(
        { success: false, error: 'You must be registered for this event to leave a testimonial' },
        { status: 403 }
      );
    }

    // Check if event is past
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      );
    }

    const eventData = eventDoc.data();
    const eventDate = eventData?.datetime;
    const now = new Date();

    // Convert Firestore Timestamp to Date if needed
    let eventDateTime: Date | null = null;
    if (eventDate) {
      if (eventDate.toDate) {
        eventDateTime = eventDate.toDate();
      } else if (eventDate instanceof Date) {
        eventDateTime = eventDate;
      }
    }

    if (eventDateTime && eventDateTime > now) {
      return NextResponse.json(
        { success: false, error: 'Cannot leave testimonial for upcoming events' },
        { status: 400 }
      );
    }

    // Get user data for name
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const userName = userData?.displayName || userData?.name || 'Anonymous';

    const { rating, comment } = await request.json();

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: 'Rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    if (!comment || comment.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Comment is required' },
        { status: 400 }
      );
    }

    // Check if testimonial already exists
    const existingTestimonials = eventData?.testimonials || [];
    const existingIndex = existingTestimonials.findIndex((t: EventTestimonial) => t.userId === userId);

    const testimonialData = {
      userId,
      name: userName,
      rating: Number(rating),
      comment: comment.trim(),
      edited: existingIndex !== -1,
      createdAt: existingIndex !== -1 ? existingTestimonials[existingIndex].createdAt : new Date(),
      updatedAt: new Date(),
    };

    if (existingIndex !== -1) {
      // Update existing testimonial
      existingTestimonials[existingIndex] = testimonialData;
    } else {
      // Add new testimonial
      existingTestimonials.push(testimonialData);
    }

    // Update event with new testimonials
    await db.collection('events').doc(eventId).update({
      testimonials: existingTestimonials,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      testimonials: existingTestimonials,
      message: existingIndex !== -1 ? 'Testimonial updated' : 'Testimonial added',
    });
  } catch (error) {
    console.error('Error saving testimonial:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save testimonial' },
      { status: 500 }
    );
  }
}
);

export const PUT = withMetrics(async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // PUT is handled the same as POST for updating testimonials
  return POST(request, context);
}
);