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

    const devices = await db
      .collection('userDeviceTokens')
      .where('userEmail', '==', userEmail)
      .where('isActive', '==', true)
      .get();

    const deviceList = devices.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      registeredAt: doc.data().registeredAt?.toDate?.(),
      lastUsedAt: doc.data().lastUsedAt?.toDate?.(),
    }));

    return Response.json({ devices: deviceList });
  } catch (error) {
    console.error('Error fetching devices:', error);
    return Response.json({ error: 'Failed to fetch devices' }, { status: 500 });
  }
}
);
