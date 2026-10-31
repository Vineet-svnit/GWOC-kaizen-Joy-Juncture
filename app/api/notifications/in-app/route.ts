import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/app/api/auth/firebase-admin';
import { cookies } from 'next/headers';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(request: NextRequest) {
  try {
    // Try to get session cookie first
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session')?.value;
    
    let userId: string | null = null;

    if (sessionCookie) {
      // Verify session cookie
      const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
      userId = decodedClaims.uid;
    } else {
      // Try to get Firebase ID token from Authorization header
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      const idToken = authHeader.substring(7); // Remove "Bearer " prefix
      const decodedClaims = await adminAuth.verifyIdToken(idToken);
      userId = decodedClaims.uid;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch user's notifications from Firestore
    const notificationsRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('notifications');

    const snapshot = await notificationsRef
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date()
    }));

    // Count unread notifications
    const unreadSnapshot = await notificationsRef
      .where('read', '==', false)
      .get();

    return NextResponse.json({
      notifications,
      unreadCount: unreadSnapshot.size
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
);
