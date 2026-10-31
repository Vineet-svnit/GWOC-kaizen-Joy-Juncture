import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase-admin';
import { ExperienceEnquiry } from '@/lib/types';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(request: NextRequest) {
  try {
    /* ---------------- AUTH ---------------- */
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = await auth.verifyIdToken(token);

    /* ---------------- ROLE CHECK (DB) ---------------- */
    const userSnap = await db
      .collection('users')
      .doc(decoded.uid)
      .get();

    if (!userSnap.exists || userSnap.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    /* ---------------- GET ENQUIRIES ---------------- */
    const enquiriesSnap = await db
      .collection('experience_enquiries')
      .orderBy('createdAt', 'desc')
      .get();

    const enquiries = enquiriesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
      repliedAt: doc.data().repliedAt?.toDate ? doc.data().repliedAt.toDate() : doc.data().repliedAt,
    })) as ExperienceEnquiry[];

    return NextResponse.json({
      success: true,
      enquiries,
    });
  } catch (error) {
    console.error('Error fetching experience enquiries:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
);

export const POST = withMetrics(async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Validate required fields
    const requiredFields = ['name', 'email', 'categoryId', 'categoryName', 'occasionDetails', 'audienceSize', 'preferredDateRange', 'budgetRange'];
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json(
          { success: false, error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    const enquiryData = {
      ...data,
      status: 'new',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection('experience_enquiries').add(enquiryData);

    // Send confirmation email
    try {
      console.log('Attempting to send experience enquiry emails...');
      const { sendEmail } = await import('@/lib/email-service');
      const emailUser = process.env.EMAIL_USER;

      // Email to User
      await sendEmail({
        to: data.email,
        subject: 'We received your Experience Enquiry! 🎪',
        html: `
              <div style="font-family: sans-serif; color: #2D3436;">
                <h1 style="color: #6C5CE7;">Your Adventure Awaits!</h1>
                <p>Hi ${data.name},</p>
                <p>Thanks for inquiring about <strong>${data.categoryName}</strong>. We've received your request and our Experience Architects are already brainstorming ideas!</p>
                <div style="background-color: #FFFDF5; border: 2px solid #000; padding: 20px; border-radius: 15px; margin: 20px 0;">
                  <h3 style="margin-top: 0;">Enquiry Details:</h3>
                  <p><strong>Occasion:</strong> ${data.occasionDetails}</p>
                  <p><strong>Audience Size:</strong> ${data.audienceSize}</p>
                  <p><strong>Date Range:</strong> ${data.preferredDateRange}</p>
                </div>
                <p>We'll get back to you within 24 hours with a custom proposal.</p>
                <p>Stay Playful,<br>The Joy Juncture Team</p>
              </div>
            `
      });

      // Email to Admin
      if (emailUser) {
        await sendEmail({
          to: emailUser,
          subject: `New Experience Enquiry: ${data.name} - ${data.categoryName}`,
          html: `
                <h1>New Enquiry Received</h1>
                <p><strong>Name:</strong> ${data.name}</p>
                <p><strong>Email:</strong> ${data.email}</p>
                <p><strong>Category:</strong> ${data.categoryName}</p>
                <p><strong>Occasion:</strong> ${data.occasionDetails}</p>
                <p><strong>Budget:</strong> ${data.budgetRange}</p>
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/admin/inquiries">View in Dashboard</a>
              `
        });
      }

    } catch (emailError) {
      console.error('Unexpected error in email block:', emailError);
    }

    return NextResponse.json({
      success: true,
      enquiry: {
        id: docRef.id,
        ...enquiryData,
      },
    });
  } catch (error) {
    console.error('Error creating experience enquiry:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
);