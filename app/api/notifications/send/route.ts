import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { sendNotifications } from '@/lib/notification-service';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Check if user is admin
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();

    if (!userData?.isAdmin && userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const {
      title,
      message,
      type = 'info',
      actionUrl,
      recipientSegment = 'all',
      image,
      channels = ['push', 'in-app'],
      priority = 'normal'
    } = body;

    if (!title || !message) {
      return NextResponse.json({ error: 'Title and message are required' }, { status: 400 });
    }

    if (!Array.isArray(channels) || channels.length === 0) {
      return NextResponse.json({ error: 'At least one notification channel must be selected' }, { status: 400 });
    }

    const results = await sendNotifications({
      title,
      message,
      type,
      actionUrl,
      recipientSegment,
      image,
      channels,
      priority
    });

    return NextResponse.json({
      success: true,
      priority,
      notificationsSent: results.notificationCount,
      pushNotificationsSent: results.pushSentCount,
      smsNotificationsSent: results.smsSentCount,
      skippedDueToQuietHours: {
        inApp: results.skippedDueToQuietHours.inApp,
        push: results.skippedDueToQuietHours.push,
        sms: results.skippedDueToQuietHours.sms,
        total: results.skippedDueToQuietHours.inApp + results.skippedDueToQuietHours.push + results.skippedDueToQuietHours.sms
      },
      message: `Sent - In-app: ${results.notificationCount}, Push: ${results.pushSentCount}, SMS: ${results.smsSentCount}${priority === 'normal'
          ? ` | Skipped (quiet hours): ${results.skippedDueToQuietHours.inApp + results.skippedDueToQuietHours.push + results.skippedDueToQuietHours.sms}`
          : ''
        }`
    });

  } catch (error: any) {
    console.error('Error sending notifications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
