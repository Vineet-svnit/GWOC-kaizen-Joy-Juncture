import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { otpStore, MAX_ATTEMPTS } from '@/lib/otpStore';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const body = await req.json();
    const { phoneNumber, otp } = body;

    if (!phoneNumber || !otp) {
      return NextResponse.json({ 
        error: 'Phone number and OTP are required' 
      }, { status: 400 });
    }

    // Get stored OTP
    const storedData = otpStore.get(phoneNumber);

    if (!storedData) {
      return NextResponse.json({ 
        error: 'OTP not found or expired. Please request a new code.' 
      }, { status: 400 });
    }

    // Check if OTP expired
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(phoneNumber);
      return NextResponse.json({ 
        error: 'OTP has expired. Please request a new code.' 
      }, { status: 400 });
    }

    // Check max attempts
    if (storedData.attempts >= MAX_ATTEMPTS) {
      otpStore.delete(phoneNumber);
      return NextResponse.json({ 
        error: 'Too many failed attempts. Please request a new code.' 
      }, { status: 429 });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts += 1;
      otpStore.set(phoneNumber, storedData);
      
      const attemptsLeft = MAX_ATTEMPTS - storedData.attempts;
      return NextResponse.json({ 
        error: `Invalid OTP. ${attemptsLeft} attempts remaining.`,
        attemptsLeft
      }, { status: 400 });
    }

    // OTP is correct! Mark phone as verified
    await adminDb.collection('users').doc(userId).set({
      phoneNumber,
      phoneVerified: true,
      phoneVerifiedAt: new Date()
    }, { merge: true });

    // Clear OTP from store
    otpStore.delete(phoneNumber);

    return NextResponse.json({
      success: true,
      message: 'Phone number verified successfully!'
    });

  } catch (error: any) {
    console.error('Error verifying OTP:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
);
