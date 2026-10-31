import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// POST /api/games/content/initialize - Initialize default content for all games (Admin only)
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

    // Read content from JSON files
    const riddlesData = await import('@/data/riddles.json');
    const triviaData = await import('@/data/trivia.json');
    const wordleData = await import('@/data/wordle.json');
    const hangmanData = await import('@/data/hangman.json');
    const wordsearchData = await import('@/data/wordsearch.json');
    const chessData = await import('@/data/chess.json');

    // Riddles
    await adminDb.doc('gameContent/riddle').set({
      items: riddlesData.default,
      updatedAt: new Date().toISOString()
    });

    // Trivia Questions
    await adminDb.doc('gameContent/trivia').set({
      items: triviaData.default,
      updatedAt: new Date().toISOString()
    });

    // Wordle Words
    await adminDb.doc('gameContent/wordle').set({
      items: wordleData.default,
      updatedAt: new Date().toISOString()
    });

    // Hangman Words
    await adminDb.doc('gameContent/hangman').set({
      items: hangmanData.default,
      updatedAt: new Date().toISOString()
    });

    // Word Search Lists
    await adminDb.doc('gameContent/wordsearch').set({
      items: wordsearchData.default,
      updatedAt: new Date().toISOString()
    });

    // Chess Puzzles
    await adminDb.doc('gameContent/chess').set({
      items: chessData.default,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: 'Game content initialized successfully',
      gamesInitialized: ['riddle', 'trivia', 'wordle', 'hangman', 'wordsearch', 'chess']
    });
  } catch (error: any) {
    console.error('Error initializing content:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
);
