import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getServerTodayString } from '@/lib/date-utils';

import { withMetrics } from '@/lib/api-metrics';
const FALLBACK_GAMES = [
  'sudoku', 'riddle', 'puzzles', 'wordle', 'chess',
  'trivia', '2048', 'hangman', 'wordsearch', 'mathquiz',
  'snake', 'minesweeper', 'tango'
];

// GET /api/games/rotation-policy - Get current rotation policy
export const GET = withMetrics(async function GET() {
  try {
    const policyRef = adminDb.doc('settings/rotationPolicy');
    const policySnap = await policyRef.get();

    // Default policy structural skeleton 
    let policy: any = policySnap.exists ? policySnap.data() : {
      enabled: true,
      gamesPerDay: 3,
      selectedGames: [], // If empty, will use all available
      rotationSchedule: {},
      gameOfTheDay: null,
      lastRotation: null
    };

    // Date check
    const today = getServerTodayString();
    const schedule = policy.rotationSchedule || {};

    // Check if we need to generate a rotation for today
    // We explicitly check if it's missing OR if the list is empty for some reason
    if (policy.enabled && (!schedule[today] || schedule[today].length === 0)) {
      // Need to generate rotation for today via Lazy Loading

      // 1. Get available games
      const settingsSnap = await adminDb.doc('settings/gamePoints').get();
      let allGames = settingsSnap.exists ? Object.keys(settingsSnap.data() || {}) : [];

      // Use fallback if DB is empty to ensure we have content
      if (allGames.length === 0) {
        allGames = FALLBACK_GAMES;
      }

      // 2. Determine pool to rotate
      // If policy has specific selectedGames, use them, otherwise use all
      const gamesToRotate = (policy.selectedGames && policy.selectedGames.length > 0)
        ? policy.selectedGames
        : allGames;

      // 3. Shuffle and Pick N
      const validGamesPerDay = policy.gamesPerDay || 3;
      const shuffled = [...gamesToRotate].sort(() => Math.random() - 0.5);
      const todaysGames = shuffled.slice(0, Math.min(validGamesPerDay, shuffled.length));

      // Select Game of the Day (randomly from today's games)
      const gameOfTheDay = todaysGames.length > 0 ? todaysGames[0] : null;

      // Update policy in DB
      await policyRef.set({
        gamesPerDay: validGamesPerDay, // Ensure this is set correctly
        rotationSchedule: {
          ...schedule,
          [today]: todaysGames
        },
        gameOfTheDay,
        lastRotation: today, // Use `today` for consistency with other parts of the code
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // SYNC: Also update the standalone gameOfTheDay setting for API consistency
      if (gameOfTheDay) {
        const gameSettingsSnap = await adminDb.doc('settings/gamePoints').get();
        const gameSettings = gameSettingsSnap.data();
        const gameName = gameSettings?.[gameOfTheDay]?.name || gameOfTheDay;

        await adminDb.doc('settings/gameOfTheDay').set({
          gameId: gameOfTheDay,
          date: today,
          gameName: gameName,
          autoSelected: true
        });
      }

      // Update local object to return
      policy = {
        ...policy,
        gamesPerDay: validGamesPerDay,
        rotationSchedule: { ...schedule, [today]: todaysGames },
        gameOfTheDay,
        lastRotation: today,
        updatedAt: new Date().toISOString()
      };
    }

    return NextResponse.json(policy);
  } catch (error: any) {
    console.error('Error fetching rotation policy:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
);

// POST /api/games/rotation-policy - Update rotation policy (Admin only)
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
      const { adminAuth } = await import('@/lib/firebaseAdmin');
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
    const { enabled, gamesPerDay, selectedGames } = body;

    if (gamesPerDay < 1 || gamesPerDay > 20) {
      return NextResponse.json({ error: 'gamesPerDay must be between 1 and 20' }, { status: 400 });
    }

    const today = getServerTodayString();


    // Get all available games
    const settingsSnap = await adminDb.doc('settings/gamePoints').get();
    const allGames = settingsSnap.exists ? Object.keys(settingsSnap.data() || {}) : [];

    // If no specific games selected, use all games
    const gamesToRotate = selectedGames && selectedGames.length > 0 ? selectedGames : allGames;

    // Use gamesPerDay from body or default to 3
    const validGamesPerDay = parseInt(gamesPerDay) || 3;

    // Generate today's rotation
    const shuffled = [...gamesToRotate].sort(() => Math.random() - 0.5);
    const todaysGames = shuffled.slice(0, Math.min(validGamesPerDay, shuffled.length));

    // First game is "Game of the Day"
    const gameOfTheDay = todaysGames.length > 0 ? todaysGames[0] : null;

    const policy = {
      enabled,
      gamesPerDay: validGamesPerDay, // Force logic to 3
      selectedGames: gamesToRotate,
      rotationSchedule: {
        [today]: todaysGames
      },
      gameOfTheDay, // Store explicitly
      lastRotation: today,
      updatedAt: new Date().toISOString()
    };

    await adminDb.doc('settings/rotationPolicy').set(policy);

    // SYNC: Also update the standalone gameOfTheDay setting for API consistency
    if (gameOfTheDay) {
      const gameSettingsSnap = await adminDb.doc('settings/gamePoints').get();
      const gameSettings = gameSettingsSnap.data();
      const gameName = gameSettings?.[gameOfTheDay]?.name || gameOfTheDay;

      await adminDb.doc('settings/gameOfTheDay').set({
        gameId: gameOfTheDay,
        date: today,
        gameName: gameName,
        autoSelected: true
      });
    }

    return NextResponse.json({ success: true, policy });
  } catch (error: any) {
    console.error('Error updating rotation policy:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);

// PUT /api/games/rotation-policy/rotate - Manually trigger rotation (Admin only)
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
      const { adminAuth } = await import('@/lib/firebaseAdmin');
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

    const policySnap = await adminDb.doc('settings/rotationPolicy').get();
    if (!policySnap.exists) {
      return NextResponse.json({ error: 'No rotation policy configured' }, { status: 404 });
    }

    const policy = policySnap.data();

    if (!policy) {
      return NextResponse.json({ error: 'Policy data is missing' }, { status: 500 });
    }

    const today = getServerTodayString();


    // Generate new rotation
    const shuffled = [...policy.selectedGames].sort(() => Math.random() - 0.5);
    const targetCount = parseInt(policy.gamesPerDay) || 3;
    const todaysGames = shuffled.slice(0, Math.min(targetCount, shuffled.length));
    const gameOfTheDay = todaysGames.length > 0 ? todaysGames[0] : null;

    const updatedPolicy = {
      ...policy,
      gamesPerDay: targetCount, // Update policy to reflect 3
      rotationSchedule: {
        ...policy.rotationSchedule,
        [today]: todaysGames
      },
      gameOfTheDay,
      lastRotation: today,
      updatedAt: new Date().toISOString()
    };

    await adminDb.doc('settings/rotationPolicy').set(updatedPolicy);

    // SYNC: Also update the standalone gameOfTheDay setting for API consistency
    if (gameOfTheDay) {
      const gameSettingsSnap = await adminDb.doc('settings/gamePoints').get();
      const gameSettings = gameSettingsSnap.data();
      const gameName = gameSettings?.[gameOfTheDay]?.name || gameOfTheDay;

      await adminDb.doc('settings/gameOfTheDay').set({
        gameId: gameOfTheDay,
        date: today,
        gameName: gameName,
        autoSelected: true
      });
    }

    return NextResponse.json({ success: true, todaysGames });
  } catch (error: any) {
    console.error('Error rotating games:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
