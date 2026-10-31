import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// GET /api/games/history?gameId=sudoku
export const GET = withMetrics(async function GET(req: NextRequest) {
  try {
    // Check if Firebase Admin is available
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ history: [] }, { status: 200 });
    }

    // Get Firebase Auth token from Authorization header
    const authorization = req.headers.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ history: [] }, { status: 200 });
    }

    const token = authorization.split('Bearer ')[1];
    let decodedToken;
    
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json({ history: [] }, { status: 200 });
    }

    const userId = decodedToken.uid;
    
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get('gameId');
    
    if (!gameId) {
      return NextResponse.json({ history: [] }, { status: 200 });
    }
    
    // Fetch user's game history from gamePlays (standardized collection)
    const historyRef = adminDb.collection(`users/${userId}/gamePlays`);
    const snapshot = await historyRef
      .where('gameId', '==', gameId)
      .orderBy('playedAt', 'desc')
      .limit(20)
      .get();
    
    const history = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return NextResponse.json({ history });
  } catch (error: any) {
    console.error('Error fetching game history:', error);
    return NextResponse.json({ history: [] }, { status: 200 });
  }
}
);

