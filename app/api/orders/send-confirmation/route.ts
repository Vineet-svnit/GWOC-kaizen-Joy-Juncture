import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, email, name, items, totalPrice, shippingAddress } = body;

    const { getOrderConfirmationTemplate } = await import('@/lib/email-templates');
    const { sendEmail } = await import('@/lib/email-service');

    const receiptHtml = getOrderConfirmationTemplate(orderId, name, items, totalPrice, shippingAddress);

    await sendEmail({
      to: email,
      subject: `Order Confirmed: #${orderId}`,
      html: receiptHtml,
    });

    return NextResponse.json({ success: true, message: 'Confirmation email sent' });

  } catch (error: any) {
    console.error('Error sending confirmation email:', error);
    return NextResponse.json({ error: 'Failed to send email', details: error.message }, { status: 500 });
  }
}
);
