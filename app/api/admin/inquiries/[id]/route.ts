import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
export const DELETE = withMetrics(async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;
        await adminDb.collection('contact_inquiries').doc(id).delete();

        return NextResponse.json({ success: true, message: 'Inquiry deleted' });

    } catch (error: any) {
        console.error('Error deleting inquiry:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
);
export const PATCH = withMetrics(async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;
        const body = await req.json();

        // Fetch the existing inquiry to get the user's email
        const inquiryDoc = await adminDb.collection('contact_inquiries').doc(id).get();
        if (!inquiryDoc.exists) {
            return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
        }
        const inquiryData = inquiryDoc.data();

        // Send email if there is a reply
        if (body.reply && inquiryData?.email) {
            console.log(`Attempting to send reply email to ${inquiryData.email}`);

            const { sendEmail } = await import('@/lib/email-service');
            const emailSent = await sendEmail({
                to: inquiryData.email,
                subject: `Re: ${inquiryData.subject || 'Your Inquiry'}`,
                html: `
                    <div style="font-family: sans-serif; color: #2D3436;">
                        <h1>Response to your Inquiry</h1>
                        <p>Dear ${inquiryData.name || 'User'},</p>
                        <p>Thank you for contacting us. Here is our response to your inquiry:</p>
                        <blockquote style="border-left: 4px solid #FFD93D; padding-left: 1rem; margin: 1rem 0; color: #555;">
                            ${body.reply.replace(/\n/g, '<br>')}
                        </blockquote>
                        <p>Best regards,<br>The Joy Juncture Team</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 2rem 0;">
                        <p style="font-size: 0.8rem; color: #888;">
                            Original Message:<br>
                            ${inquiryData.message}
                        </p>
                    </div>
                `
            });

            if (emailSent) {
                console.log(`Reply sent successfully to ${inquiryData.email}`);
            } else {
                console.error('Failed to send reply email');
            }
        }

        const updateData = {
            ...body,
            updatedAt: new Date(),
        };

        if (body.reply) {
            updateData.repliedAt = new Date();
        }

        await adminDb.collection('contact_inquiries').doc(id).update(updateData);

        return NextResponse.json({ success: true, message: 'Inquiry updated' });

    } catch (error: any) {
        console.error('Error updating inquiry:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
);
