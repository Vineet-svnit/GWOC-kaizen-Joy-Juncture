import { db, auth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(request: Request) {
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

    const { deviceId } = await request.json();

    if (!deviceId) {
      return Response.json({ error: 'Device ID is required' }, { status: 400 });
    }

    // Verify ownership and deactivate
    const deviceRef = db.collection('userDeviceTokens').doc(deviceId);
    const device = await deviceRef.get();

    if (!device.exists || device.data()?.userEmail !== userEmail) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    await deviceRef.update({
      isActive: false,
      deactivatedAt: Timestamp.now(),
    });

    return Response.json({ success: true, message: 'Device unregistered' });
  } catch (error) {
    console.error('Error unregistering device:', error);
    return Response.json(
      { error: 'Failed to unregister device' },
      { status: 500 }
    );
  }
}
);
