import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { headers } from 'next/headers';

import { withMetrics } from '@/lib/api-metrics';
// POST /api/admin/migrate-balance - Migrate points field to balance field for all users
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    // Get Firebase Auth token from Authorization header
    const headersList = await headers();
    const authorization = headersList.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1];
    let decodedToken;
    
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (error) {
      console.error('Token verification failed:', error);
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    // Check if user is admin
    const userRef = adminDb.collection('users').doc(decodedToken.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    
    if (!userData?.isAdmin && userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all users
    const usersSnapshot = await adminDb.collection('users').get();
    let migratedCount = 0;
    let skippedCount = 0;

    const batch = adminDb.batch();
    
    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      
      // Consolidate all balance fields into 'points' field
      const maxBalance = Math.max(
        data.points || 0,
        data.balance || 0,
        data.wallet || 0
      );
      
      if (maxBalance > 0) {
        batch.update(doc.ref, {
          points: maxBalance,
          // Keep old fields for reference but mark as migrated
          _migrated: true,
          _migratedAt: new Date().toISOString(),
          _oldBalance: data.balance || 0,
          _oldWallet: data.wallet || 0
        });
        migratedCount++;
      } else {
        skippedCount++;
      }
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: 'Balance migration completed',
      migratedCount,
      skippedCount,
      totalUsers: usersSnapshot.size
    });

  } catch (error: any) {
    console.error('Error migrating balance:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
);
