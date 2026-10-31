import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/app/api/auth/firebase-admin';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(request: NextRequest) {
  try {
    // Verify admin token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedClaims = await adminAuth.verifyIdToken(idToken);

    // Check if user is admin
    const userRef = adminDb.collection('users').doc(decodedClaims.uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists || userSnap.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();

    // Save settings to Firestore
    const settingsRef = adminDb.collection('settings').doc('store');
    await settingsRef.set({
      ...body,
      updatedAt: new Date(),
      updatedBy: decodedClaims.uid,
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
);
