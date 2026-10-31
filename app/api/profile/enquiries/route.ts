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

    /* ---------------- GET USER ENQUIRIES ---------------- */
    // First try to get enquiries by userId (for authenticated submissions)
    const enquiriesByUserIdSnap = await db
      .collection('experience_enquiries')
      .where('userId', '==', decoded.uid)
      .get();

    // Also get enquiries by email (for legacy enquiries or anonymous submissions that match user email)
    const enquiriesByEmailSnap = await db
      .collection('experience_enquiries')
      .where('email', '==', decoded.email)
      .get();

    // Combine results and filter out duplicates (enquiries that have userId set should only appear once)
    const allDocs = [...enquiriesByUserIdSnap.docs];
    const userIdDocIds = new Set(enquiriesByUserIdSnap.docs.map(doc => doc.id));

    // Add email-based enquiries that don't already have userId set
    enquiriesByEmailSnap.docs.forEach(doc => {
      if (!userIdDocIds.has(doc.id) && !doc.data().userId) {
        allDocs.push(doc);
      }
    });

    const enquiries = allDocs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      }))
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA; // Descending order (newest first)
      }) as ExperienceEnquiry[];

    return NextResponse.json({
      success: true,
      enquiries,
    });
  } catch (error) {
    console.error('Error fetching user enquiries:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
);