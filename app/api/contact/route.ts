import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import nodemailer from 'nodemailer';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, subject, message } = body;

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // 1. Save to Firestore
    const inquiryRef = await adminDb.collection('contact_inquiries').add({
      name,
      email,
      subject,
      message,
      status: 'unread',
      createdAt: new Date(),
    });

    // 2. Send Acknowledgement Email
    const { sendEmail } = await import('@/lib/email-service');
    const { getBaseEmailTemplate } = await import('@/lib/email-templates');

    const acknowledgementHtml = getBaseEmailTemplate(
      `We've received your inquiry: ${subject}`,
      `Hello ${name},<br><br>Thank you for reaching out to us! We've received your message and our team will get back to you shortly.<br><br><div style="background:white; border:2px solid black; padding:15px; box-shadow:4px 4px 0px black;"><strong>Your Message:</strong><br><br><i>${message}</i></div>`
    );

    await sendEmail({
      to: email,
      subject: `We've received your inquiry: ${subject}`,
      html: acknowledgementHtml,
    });

    return NextResponse.json({
      success: true,
      message: 'Inquiry received successfully',
      id: inquiryRef.id
    });

  } catch (error: any) {
    console.error('Error handling contact submission:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}
);
