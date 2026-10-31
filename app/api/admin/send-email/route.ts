import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import nodemailer from 'nodemailer';

import { withMetrics } from '@/lib/api-metrics';
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
    const { subject, message, htmlContent, recipientSegment = 'all' } = body;

    if (!subject || !message) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
    }

    // Check email configuration (Basic check, though sendEmail handles it too)
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.error('Email credentials not configured');
      return NextResponse.json({
        error: 'Email service not configured. Please add EMAIL_USER and EMAIL_APP_PASSWORD to environment variables.'
      }, { status: 500 });
    }

    // Get users based on segment
    let usersSnapshot;

    if (recipientSegment !== 'all') {
      usersSnapshot = await adminDb.collection('users')
        .where('tier', '==', recipientSegment)
        .get();
    } else {
      usersSnapshot = await adminDb.collection('users').get();
    }

    const users = usersSnapshot.docs
      .map(doc => doc.data())
      .filter(user => user.email);

    if (users.length === 0) {
      return NextResponse.json({
        error: 'No users found with email addresses'
      }, { status: 400 });
    }

    // Prepare email content
    const { getBaseEmailTemplate } = await import('@/lib/email-templates');
    const { sendEmail } = await import('@/lib/email-service');
    const emailHtml = htmlContent || getBaseEmailTemplate(subject, message);

    // Send emails (batch sending)
    let sentCount = 0;
    let failedCount = 0;

    for (const user of users) {
      const success = await sendEmail({
        to: user.email,
        subject: subject,
        text: message,
        html: emailHtml,
      });

      if (success) {
        sentCount++;
      } else {
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      emailsSent: sentCount,
      emailsFailed: failedCount,
      totalRecipients: users.length,
      message: `Emails sent to ${sentCount} users${failedCount > 0 ? `, ${failedCount} failed` : ''}`
    });

  } catch (error: any) {
    console.error('Error sending emails:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}
);
