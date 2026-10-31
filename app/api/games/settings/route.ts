import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// GET /api/games/settings - Get all game settings
export const GET = withMetrics(async function GET(req: NextRequest) {
  try {
    const settingsSnap = await adminDb.doc('settings/gamePoints').get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    
    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error('Error fetching game settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);

// POST /api/games/settings - Admin only: Update game settings
// Body: { gameId, name, basePoints, retryPenalty, maxRetries, scratcher, setAsGameOfDay }
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
    
    const body = await req.json();
    const { gameId, name, basePoints, retryPenalty, maxRetries, scratcher, setAsGameOfDay } = body;
    
    if (!gameId) {
      return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });
    }
    
    // Update game points settings
    const settingsRef = adminDb.doc('settings/gamePoints');
    const gameConfig: any = {};
    
    if (name !== undefined) gameConfig.name = name;
    if (basePoints !== undefined) gameConfig.basePoints = basePoints;
    if (retryPenalty !== undefined) gameConfig.retryPenalty = retryPenalty;
    if (maxRetries !== undefined) gameConfig.maxRetries = maxRetries;
    if (scratcher !== undefined) gameConfig.scratcher = scratcher;
    
    await settingsRef.set({
      [gameId]: gameConfig,
    }, { merge: true });
    
    // Optionally set as Game of the Day
    if (setAsGameOfDay) {
      const today = new Date().toISOString().slice(0, 10);
      await adminDb.doc('settings/gameOfTheDay').set({
        gameId,
        gameName: name || gameId,
        date: today,
        autoSelected: false
      });
    }
    
    return NextResponse.json({ success: true, gameId, config: gameConfig });
  } catch (error: any) {
    console.error('Error updating game settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);

// PUT /api/games/settings - Admin only: Bulk update all game settings
export const PUT = withMetrics(async function PUT(req: NextRequest) {
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
    
    const { settings } = await req.json();
    
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings object' }, { status: 400 });
    }
    
    const settingsRef = adminDb.doc('settings/gamePoints');
    await settingsRef.set(settings, { merge: true });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error bulk updating game settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);

