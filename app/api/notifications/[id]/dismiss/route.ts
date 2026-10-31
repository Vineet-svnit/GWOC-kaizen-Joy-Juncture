import { NextRequest, NextResponse } from 'next/server';
import { adminAuth as authAdmin } from '@/app/api/auth/firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { cookies } from 'next/headers';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session')?.value;
    
    let userId: string | null = null;

    if (sessionCookie) {
      const decodedClaims = await authAdmin.verifySessionCookie(sessionCookie);
      userId = decodedClaims.uid;
    } else {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const idToken = authHeader.substring(7);
      const decodedClaims = await authAdmin.verifyIdToken(idToken);
      userId = decodedClaims.uid;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notifRef = adminDb
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .doc(id);
    
    const notif = await notifRef.get();

    if (!notif.exists) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    await notifRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error dismissing notification:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss notification' },
      { status: 500 }
    );
  }
}
);
