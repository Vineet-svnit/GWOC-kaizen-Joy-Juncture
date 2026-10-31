import { db, auth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(request: Request) {
  try {
    // Get Firebase auth token from header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const userEmail = decodedToken.email;

    if (!userEmail) {
      return Response.json({ error: 'User email not found' }, { status: 400 });
    }

    const userPrefsRef = db.collection('userNotificationPreferences').doc(userEmail);
    const userPrefs = await userPrefsRef.get();

    if (!userPrefs.exists) {
      // Return default preferences
      return Response.json({
        preferences: {
          pushEnabled: true,
          inAppEnabled: true,
          smsEnabled: true,
          categories: {
            promotional: true,
            offers: true,
            ordersShipping: true,
            gamification: true,
            announcements: true,
          },
          quietHours: {
            enabled: false,
            startTime: '22:00',
            endTime: '08:00',
            timezone: 'Asia/Kolkata',
          },
          frequency: 'all',
        },
      });
    }

    const prefs = userPrefs.data();
    return Response.json({
      preferences: {
        ...prefs,
        updatedAt: prefs?.updatedAt?.toDate?.(),
      },
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return Response.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}
);

export const PUT = withMetrics(async function PUT(request: Request) {
  try {
    // Get Firebase auth token from header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const userEmail = decodedToken.email;

    if (!userEmail) {
      return Response.json({ error: 'User email not found' }, { status: 400 });
    }

    const preferences = await request.json();

    await db.collection('userNotificationPreferences').doc(userEmail).set({
      ...preferences,
      updatedAt: Timestamp.now(),
    }, { merge: true });

    return Response.json({
      success: true,
      message: 'Preferences updated',
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return Response.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
);
