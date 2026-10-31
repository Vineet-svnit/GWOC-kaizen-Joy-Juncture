import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      registrationId,
      email,
      name,
      eventTitle,
      eventDate,
      eventLocation,
      amount
    } = body;

    const { getEventConfirmationTemplate } = await import('@/lib/email-templates');
    const { sendEmail } = await import('@/lib/email-service');

    const ticketHtml = getEventConfirmationTemplate(registrationId, name, eventTitle, eventDate, eventLocation, amount);

    await sendEmail({
      to: email,
      subject: `Ticket Confirmed: ${eventTitle}`,
      html: ticketHtml,
    });

    return NextResponse.json({ success: true, message: 'Confirmation email sent' });

  } catch (error: any) {
    console.error('Error sending confirmation email:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
);
