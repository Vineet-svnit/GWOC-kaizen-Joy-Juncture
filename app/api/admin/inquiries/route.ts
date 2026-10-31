import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(req: NextRequest) {
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

        const snapshot = await adminDb.collection('contact_inquiries').orderBy('createdAt', 'desc').get();
        const inquiries = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : doc.data().createdAt,
            repliedAt: doc.data().repliedAt?.toDate ? doc.data().repliedAt.toDate() : doc.data().repliedAt
        }));

        return NextResponse.json({ inquiries });

    } catch (error: any) {
        console.error('Error fetching inquiries:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
);
