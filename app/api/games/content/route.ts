import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// GET /api/games/content?gameId={id} - Get game content
export const GET = withMetrics(async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get('gameId');
    
    if (!gameId) {
      return NextResponse.json({ error: 'gameId required' }, { status: 400 });
    }
    
    const contentSnap = await adminDb.doc(`gameContent/${gameId}`).get();
    
    if (!contentSnap.exists) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }
    
    return NextResponse.json({ content: contentSnap.data() });
  } catch (error: any) {
    console.error('Error fetching game content:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);

// POST /api/games/content - Update game content (Admin only)
export const POST = withMetrics(async function POST(req: NextRequest) {
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
    
    const body = await req.json();
    const { gameId, content } = body;
    
    if (!gameId || !content) {
      return NextResponse.json({ error: 'gameId and content required' }, { status: 400 });
    }
    
    await adminDb.doc(`gameContent/${gameId}`).set({
      ...content,
      updatedAt: new Date().toISOString(),
      updatedBy: decodedToken.email || userData?.email || decodedToken.uid
    }, { merge: true });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating game content:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);

// DELETE /api/games/content - Delete content item (Admin only)
export const DELETE = withMetrics(async function DELETE(req: NextRequest) {
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
    
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get('gameId');
    const itemId = searchParams.get('itemId');
    
    if (!gameId || !itemId) {
      return NextResponse.json({ error: 'gameId and itemId required' }, { status: 400 });
    }
    
    const contentSnap = await adminDb.doc(`gameContent/${gameId}`).get();
    if (!contentSnap.exists) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }
    
    const content = contentSnap.data();
    const items = content?.items || [];
    const filtered = items.filter((item: any) => item.id !== itemId);
    
    await adminDb.doc(`gameContent/${gameId}`).update({
      items: filtered,
      updatedAt: new Date().toISOString()
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting content:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
);
