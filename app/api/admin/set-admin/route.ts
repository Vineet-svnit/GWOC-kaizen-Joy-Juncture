import { NextRequest, NextResponse } from 'next/server';

import { withMetrics } from '@/lib/api-metrics';
/**
 * Development endpoint to promote a user to admin
 * In production, this should require proper authorization
 */
export const POST = withMetrics(async function POST(request: NextRequest) {
  try {
    const { adminDb, adminAuth } = await import('@/app/api/auth/firebase-admin');
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Get user by email from Firebase Auth
    const userRecord = await adminAuth.getUserByEmail(email);

    // Update user document in Firestore
    const userRef = adminDb.collection('users').doc(userRecord.uid);
    await userRef.set(
      {
        role: 'admin',
        email: email,
        name: userRecord.displayName || 'Admin User',
        updated_at: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json(
      {
        success: true,
        message: `User ${email} promoted to admin`,
        uid: userRecord.uid,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error setting admin:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to set admin role',
      },
      { status: 500 }
    );
  }
}
);
