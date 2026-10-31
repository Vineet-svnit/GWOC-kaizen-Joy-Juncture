import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
// POST /api/wallet/deduct
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    // Check if Firebase Admin is available
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ 
        success: false, 
        error: 'Wallet service unavailable' 
      }, { status: 503 });
    }

    // Get Firebase Auth token
    const authorization = req.headers.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized - Please sign in' 
      }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1];
    let decodedToken;
    
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid authentication token' 
      }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const body = await req.json();
    const { amount, reason } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid amount' 
      }, { status: 400 });
    }

    // Get user's current balance
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`User ${userId} not found, creating with 0 JP`);
      // Create user document if it doesn't exist
      await userRef.set({
        points: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      return NextResponse.json({ 
        success: false, 
        error: `You have 0 JP. You need ${amount} JP to use this feature.` 
      }, { status: 400 });
    }

    const userData = userDoc.data();
    const currentBalance = userData?.points || 0;

    console.log(`User ${userId} has ${currentBalance} JP, needs ${amount} JP`);

    if (currentBalance < amount) {
      return NextResponse.json({ 
        success: false, 
        error: `Insufficient JP. You have ${currentBalance} JP but need ${amount} JP` 
      }, { status: 400 });
    }

    // Deduct JP
    const newBalance = currentBalance - amount;
    await userRef.update({
      points: newBalance,
      updatedAt: new Date().toISOString()
    });

    // Log transaction
    await adminDb.collection('transactions').add({
      userId,
      type: 'deduction',
      amount: -amount,
      reason: reason || 'JP deduction',
      previousBalance: currentBalance,
      newBalance,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({ 
      success: true, 
      newBalance,
      deducted: amount,
      message: `${amount} JP deducted successfully` 
    });
  } catch (error: any) {
    console.error('Error deducting JP:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to deduct JP',
      details: error.message 
    }, { status: 500 });
  }
}
);
