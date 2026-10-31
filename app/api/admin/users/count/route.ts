import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(req: NextRequest) {
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

    // Count total users
    const usersSnapshot = await adminDb.collection('users').count().get();
    const totalCount = usersSnapshot.data().count;

    return NextResponse.json({
      count: totalCount,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error getting user count:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
