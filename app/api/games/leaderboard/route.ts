import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// GET /api/games/leaderboard?gameId=sudoku&limit=10
export const GET = withMetrics(async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get('gameId');
    const limit = parseInt(searchParams.get('limit') || '10');
    
    if (!gameId) {
      return NextResponse.json({ error: 'gameId required' }, { status: 400 });
    }
    
    // Fetch leaderboard from Firestore
    const leaderboardRef = adminDb.collection(`leaderboards/${gameId}/users`);
    const snapshot = await leaderboardRef
      .orderBy('totalPoints', 'desc')
      .limit(limit)
      .get();
    
    const leaderboard = snapshot.docs.map(doc => ({
      userId: doc.id,
      ...doc.data()
    }));
    
    return NextResponse.json({ leaderboard });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);

