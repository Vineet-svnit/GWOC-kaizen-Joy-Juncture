import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/app/api/auth/firebase-admin';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(request: NextRequest) {
  try {
    // Get authorization token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Get all unread notifications for the user
    const notificationsRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('notifications');

    const unreadSnapshot = await notificationsRef
      .where('read', '==', false)
      .get();

    // Mark all as read using batch write
    const batch = adminDb.batch();
    unreadSnapshot.docs.forEach((doc: any) => {
      batch.update(doc.ref, { 
        read: true,
        readAt: new Date().toISOString()
      });
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      markedCount: unreadSnapshot.size,
      message: `Marked ${unreadSnapshot.size} notification(s) as read`
    });

  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark notifications as read', details: error.message },
      { status: 500 }
    );
  }
}
);
