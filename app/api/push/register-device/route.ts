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
    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;

    if (!userEmail) {
      return Response.json({ error: 'User email not found' }, { status: 400 });
    }

    const { deviceToken, deviceType, deviceName } = await request.json();

    if (!deviceToken) {
      return Response.json({ error: 'Device token is required' }, { status: 400 });
    }

    // Check if token already exists
    const existingTokens = await db
      .collection('userDeviceTokens')
      .where('deviceToken', '==', deviceToken)
      .get();

    if (!existingTokens.empty) {
      // Update existing token
      await existingTokens.docs[0].ref.update({
        isActive: true,
        lastUsedAt: Timestamp.now(),
      });

      return Response.json({
        success: true,
        message: 'Device token updated',
      });
    }

    // Create new device token record
    await db.collection('userDeviceTokens').add({
      userId,
      userEmail,
      deviceToken,
      deviceType: deviceType || 'web',
      deviceName: deviceName || 'Unknown Device',
      isActive: true,
      registeredAt: Timestamp.now(),
      lastUsedAt: Timestamp.now(),
    });

    return Response.json({
      success: true,
      message: 'Device registered for notifications',
    });
  } catch (error) {
    console.error('Error registering device:', error);
    return Response.json(
      { error: 'Failed to register device' },
      { status: 500 }
    );
  }
}
);
