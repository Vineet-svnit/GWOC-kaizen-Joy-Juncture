import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import { withMetrics } from '@/lib/api-metrics';
// GET: Fetch current logo URL
export const GET = withMetrics(async function GET() {
    try {
        const docRef = doc(db, 'content', 'siteSettings');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            return NextResponse.json({ logoUrl: data.logoUrl || null });
        }

        return NextResponse.json({ logoUrl: null });
    } catch (error) {
        console.error('Error fetching logo:', error);
        return NextResponse.json({ error: 'Failed to fetch logo' }, { status: 500 });
    }
}
);

// POST: Update logo URL
export const POST = withMetrics(async function POST(request: NextRequest) {
    try {
        const { logoUrl } = await request.json();

        if (!logoUrl || typeof logoUrl !== 'string') {
            return NextResponse.json({ error: 'Invalid logo URL' }, { status: 400 });
        }

        const docRef = doc(db, 'content', 'siteSettings');
        await setDoc(docRef, { logoUrl }, { merge: true });

        return NextResponse.json({ success: true, logoUrl });
    } catch (error) {
        console.error('Error updating logo:', error);
        return NextResponse.json({ error: 'Failed to update logo' }, { status: 500 });
    }
}
);
