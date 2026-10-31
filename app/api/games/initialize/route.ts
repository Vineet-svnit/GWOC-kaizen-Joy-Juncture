import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// POST /api/games/initialize - Admin only: Initialize default game settings
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
    
    // Default game configurations
    const defaultSettings = {
      sudoku: {
        name: 'Sudoku',
        basePoints: 20,
        retryPenalty: 3,
        maxRetries: 3,
        scratcher: {
          enabled: false,
          drops: [
            { prob: 0.5, points: 10, label: 'Bronze' },
            { prob: 0.3, points: 25, label: 'Silver' },
            { prob: 0.15, points: 50, label: 'Gold' },
            { prob: 0.05, points: 100, label: 'Diamond' }
          ]
        }
      },
      riddle: {
        name: 'Daily Riddle',
        basePoints: 15,
        retryPenalty: 2,
        maxRetries: 5,
        scratcher: {
          enabled: false,
          drops: [
            { prob: 0.6, points: 5, label: 'Bronze' },
            { prob: 0.25, points: 15, label: 'Silver' },
            { prob: 0.1, points: 30, label: 'Gold' },
            { prob: 0.05, points: 50, label: 'Diamond' }
          ]
        }
      },
      wordle: {
        name: 'Wordle',
        basePoints: 25,
        retryPenalty: 4,
        maxRetries: 6,
        scratcher: { enabled: false }
      },
      chess: {
        name: 'Chess Puzzle',
        basePoints: 30,
        retryPenalty: 5,
        maxRetries: 3,
        scratcher: { enabled: false }
      },
      trivia: {
        name: 'Trivia Quiz',
        basePoints: 10,
        retryPenalty: 1,
        maxRetries: 10,
        scratcher: { enabled: false }
      },
      puzzles: {
        name: 'Brain Games (3-in-1)',
        basePoints: 35,
        retryPenalty: 3,
        maxRetries: 5,
        scratcher: { enabled: false }
      },
      '2048': {
        name: '2048',
        basePoints: 30,
        retryPenalty: 2,
        maxRetries: 10,
        scratcher: { enabled: false }
      },
      hangman: {
        name: 'Hangman',
        basePoints: 20,
        retryPenalty: 3,
        maxRetries: 6,
        scratcher: { enabled: false }
      },
      wordsearch: {
        name: 'Word Search',
        basePoints: 25,
        retryPenalty: 2,
        maxRetries: 10,
        scratcher: { enabled: false }
      },
      mathquiz: {
        name: 'Math Quiz',
        basePoints: 20,
        retryPenalty: 1,
        maxRetries: 10,
        scratcher: { enabled: false }
      }
    };
    
    // Save to Firestore
    const settingsRef = adminDb.doc('settings/gamePoints');
    await settingsRef.set(defaultSettings, { merge: true });
    
    // Initialize Game of the Day
    const today = new Date().toISOString().slice(0, 10);
    const gameIds = Object.keys(defaultSettings);
    const randomGameId = gameIds[Math.floor(Math.random() * gameIds.length)];
    
    await adminDb.doc('settings/gameOfTheDay').set({
      gameId: randomGameId,
      gameName: defaultSettings[randomGameId as keyof typeof defaultSettings].name,
      date: today,
      autoSelected: true
    });
    
    // Initialize Rotation Policy (disabled by default)
    const shuffled = [...gameIds].sort(() => Math.random() - 0.5);
    const todaysGames = shuffled.slice(0, 5);
    
    await adminDb.doc('settings/rotationPolicy').set({
      enabled: false,
      gamesPerDay: 5,
      selectedGames: gameIds,
      rotationSchedule: {
        [today]: todaysGames
      },
      lastRotation: today,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    
    // Initialize game content (call content initialize endpoint)
    try {
      await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/games/content/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': req.headers.get('cookie') || ''
        }
      });
    } catch (error) {
      console.error('Error initializing content:', error);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Game settings and content initialized successfully',
      gamesConfigured: Object.keys(defaultSettings),
      gameOfTheDay: randomGameId,
      rotationPolicy: 'initialized',
      contentInitialized: true
    });
  } catch (error: any) {
    console.error('Error initializing game settings:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
);

// GET /api/games/initialize - Check if settings are initialized
export const GET = withMetrics(async function GET() {
  try {
    const settingsSnap = await adminDb.doc('settings/gamePoints').get();
    const gotdSnap = await adminDb.doc('settings/gameOfTheDay').get();
    
    return NextResponse.json({
      initialized: settingsSnap.exists && gotdSnap.exists,
      gamesCount: settingsSnap.exists ? Object.keys(settingsSnap.data() || {}).length : 0,
      gameOfTheDay: gotdSnap.exists ? gotdSnap.data() : null
    });
  } catch (error: any) {
    console.error('Error checking initialization:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
