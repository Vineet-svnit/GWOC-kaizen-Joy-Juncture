import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import twilio from 'twilio';
import { otpStore, generateOTP, OTP_EXPIRY_MS } from '@/lib/otpStore';
import { SmsTemplates } from '@/lib/sms-templates';

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
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Validate phone number format (basic E.164 validation)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return NextResponse.json({
        error: 'Invalid phone number format. Use E.164 format (e.g., +1234567890)'
      }, { status: 400 });
    }

    // Check if phone number is already verified by another user
    const existingUser = await adminDb.collection('users')
      .where('phoneNumber', '==', phoneNumber)
      .where('phoneVerified', '==', true)
      .get();

    if (!existingUser.empty && existingUser.docs[0].id !== userId) {
      return NextResponse.json({
        error: 'This phone number is already verified by another account'
      }, { status: 409 });
    }

    // Initialize Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !twilioPhone) {
      console.error('Twilio credentials not configured:', {
        hasAccountSid: !!accountSid,
        hasAuthToken: !!authToken,
        hasTwilioPhone: !!twilioPhone
      });
      return NextResponse.json({
        error: 'SMS service not configured'
      }, { status: 500 });
    }

    console.log('Twilio credentials loaded:', {
      hasAccountSid: !!accountSid,
      hasAuthToken: !!authToken,
      hasTwilioPhone: !!twilioPhone,
      phoneFormat: twilioPhone
    });

    // Check if mock OTP is explicitly enabled
    const useMockOTP = process.env.USE_MOCK_OTP === 'true';

    // Generate OTP
    const otp = useMockOTP ? '123456' : generateOTP(); // Use fixed OTP only when explicitly enabled
    const expiresAt = Date.now() + OTP_EXPIRY_MS;

    // Store OTP
    otpStore.set(phoneNumber, { otp, expiresAt, attempts: 0 });

    // In mock mode, skip Twilio and just log the OTP
    if (useMockOTP) {
      console.log('🔐 MOCK OTP MODE - OTP for', phoneNumber, ':', otp);
      console.log('⚠️  Set USE_MOCK_OTP=false in .env.local to use real Twilio SMS');

      // Update user's phone number (not verified yet)
      await adminDb.collection('users').doc(userId).set({
        phoneNumber,
        phoneVerified: false,
        phoneUpdatedAt: new Date()
      }, { merge: true });

      return NextResponse.json({
        success: true,
        message: 'OTP sent successfully (Mock Mode)',
        expiresIn: 600, // seconds
        devMode: true,
        devOtp: otp // Only in mock mode!
      });
    }

    // Production mode - use Twilio
    const client = twilio(accountSid, authToken);

    // Send SMS
    try {
      await client.messages.create({
        body: SmsTemplates.otp(otp, 10),
        from: twilioPhone,
        to: phoneNumber
      });

      // Update user's phone number (not verified yet)
      await adminDb.collection('users').doc(userId).set({
        phoneNumber,
        phoneVerified: false,
        phoneUpdatedAt: new Date()
      }, { merge: true });

      return NextResponse.json({
        success: true,
        message: 'OTP sent successfully',
        expiresIn: 600 // seconds
      });

    } catch (twilioError: any) {
      console.error('Twilio SMS error:', {
        message: twilioError.message,
        code: twilioError.code,
        status: twilioError.status,
        moreInfo: twilioError.moreInfo,
        details: twilioError.details
      });

      // If Twilio fails due to unverified number, fall back to dev mode
      if (twilioError.code === 21608) {
        console.log('⚠️  Twilio trial account limitation - falling back to development mode');
        console.log('🔐 OTP for', phoneNumber, ':', otp);

        // Update user's phone number (not verified yet)
        await adminDb.collection('users').doc(userId).set({
          phoneNumber,
          phoneVerified: false,
          phoneUpdatedAt: new Date()
        }, { merge: true });

        return NextResponse.json({
          success: true,
          message: 'OTP sent successfully (Fallback Mode - Check Console)',
          expiresIn: 600,
          devMode: true,
          devOtp: otp,
          note: 'Twilio trial account - OTP shown in server console'
        });
      }

      return NextResponse.json({
        error: 'Failed to send SMS. Please check your phone number.',
        details: twilioError.message || 'Unknown error'
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error sending OTP:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}
);
