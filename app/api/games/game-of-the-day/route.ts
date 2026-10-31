import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getServerTodayString } from '@/lib/date-utils';

import { withMetrics } from '@/lib/api-metrics';
// GET /api/games/game-of-the-day
export const GET = withMetrics(async function GET() {
  try {
    const today = getServerTodayString();
    const gotdSnap = await adminDb.doc('settings/gameOfTheDay').get();
    const gotd = gotdSnap.exists ? gotdSnap.data() : undefined;
    
    // If already set for today, return it
    if (gotd && gotd.date === today && gotd.gameId) {
      return NextResponse.json({ 
        gameId: gotd.gameId, 
        date: gotd.date,
        gameName: gotd.gameName || gotd.gameId 
      });
    }
    
    // Auto-select a random game for today
    const settingsSnap = await adminDb.doc('settings/gamePoints').get();
    const settings = settingsSnap.exists ? settingsSnap.data() : undefined;
    const gameIds = settings ? Object.keys(settings) : [];
    
    if (!gameIds.length) {
      // No games configured, use defaults
      const defaultGames = ['sudoku', 'riddle'];
      const randomGameId = defaultGames[Math.floor(Math.random() * defaultGames.length)];
      await adminDb.doc('settings/gameOfTheDay').set({ 
        gameId: randomGameId, 
        date: today,
        gameName: randomGameId.charAt(0).toUpperCase() + randomGameId.slice(1),
        autoSelected: true
      });
      return NextResponse.json({ gameId: randomGameId, date: today, gameName: randomGameId });
    }
    
    const randomGameId = gameIds[Math.floor(Math.random() * gameIds.length)];
    const gameName = settings?.[randomGameId]?.name || randomGameId;
    
    await adminDb.doc('settings/gameOfTheDay').set({ 
      gameId: randomGameId, 
      date: today,
      gameName,
      autoSelected: true
    });
    
    return NextResponse.json({ gameId: randomGameId, date: today, gameName });
  } catch (error: any) {
    console.error('Error getting game of the day:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);

// POST /api/games/game-of-the-day - Admin only: manually set game of the day
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    // Get Firebase Auth token from Authorization header
    const authorization = req.headers.get('authorization');
    
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
    
    const { gameId, gameName } = await req.json();
    if (!gameId) {
      return NextResponse.json({ error: 'gameId required' }, { status: 400 });
    }
    
    const today = getServerTodayString();
    const updates: any = { 
      gameId, 
      date: today,
      gameName: gameName || gameId,
      autoSelected: false
    };

    // 1. Update Legacy/Direct GOTD Doc
    await adminDb.doc('settings/gameOfTheDay').set(updates);

    // 2. Sync with Rotation Policy (Primary Source of Truth for Frontend)
    const policyRef = adminDb.doc('settings/rotationPolicy');
    const policySnap = await policyRef.get();
    
    if (policySnap.exists) {
        const policy = policySnap.data();
        let currentSchedule = policy?.rotationSchedule?.[today] || [];
        
        // Ensure new GOTD is in today's rotation
        // Strategy: If it's not in the list, replace the first one (since first is usually GOTD). 
        // If the list is empty, just make it the list.
        if (!currentSchedule.includes(gameId)) {
            if (currentSchedule.length > 0) {
                currentSchedule[0] = gameId; // Replace first
            } else {
                currentSchedule = [gameId];
            }
        } else {
            // If it IS in the list, move it to the front to be "Game of the Day" highlighted
            currentSchedule = [gameId, ...currentSchedule.filter((g: string) => g !== gameId)];
        }

        await policyRef.set({
            gameOfTheDay: gameId,
            rotationSchedule: {
                ...policy?.rotationSchedule,
                [today]: currentSchedule
            }
        }, { merge: true });
    }
    
    return NextResponse.json({ success: true, gameId, date: today });
  } catch (error: any) {
    console.error('Error setting game of the day:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
