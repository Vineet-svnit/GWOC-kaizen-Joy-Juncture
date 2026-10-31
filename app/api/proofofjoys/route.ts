import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin'; import { withMetrics } from '@/lib/api-metrics';
// Correct import
import { Testimonial } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore'; // Admin SDK types

// Force dynamic to ensure we get fresh data
export const dynamic = 'force-dynamic';

export const GET = withMetrics(async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const getAll = searchParams.get('all') === 'true';

        // In a real app, we would verify the session/token here to ensure admin format for "getAll"
        // For now, we'll assuming the client logic protects the query param or adding a header check if needed.
        // Better: Helper to check admin token from headers. 
        // Simplify: Just fetch based on param for now.

        const proofofjoysRef = adminDb.collection('proofofjoys');
        let query; // : FirebaseFirestore.Query;

        if (getAll) {
            query = proofofjoysRef.orderBy('createdAt', 'desc');
        } else {
            query = proofofjoysRef.where('status', '==', 'approved').orderBy('createdAt', 'desc');
        }

        const snapshot = await query.get();

        const proofofjoys = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: (doc.data().createdAt as Timestamp)?.toDate?.() || new Date().toISOString()
        }));

        return NextResponse.json({ success: true, proofofjoys });
    } catch (error: any) {
        console.error('Error fetching proofofjoys:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch proofofjoys' },
            { status: 500 }
        );
    }
}
);

export const POST = withMetrics(async function POST(req: NextRequest) {
    try {
        const data = await req.json();

        // Basic validation
        if (!data.name || !data.quote) {
            return NextResponse.json(
                { success: false, error: 'Name and quote are required' },
                { status: 400 }
            );
        }

        const newTestimonial: Omit<Testimonial, 'id'> = {
            name: data.name,
            role: data.role || 'Community Member',
            quote: data.quote,
            image: data.image || '',
            status: 'pending', // Default to pending
            createdAt: new Date().toISOString() // Store as ISO string for simplicity or Firestore Timestamp
        };

        const docRef = await adminDb.collection('proofofjoys').add({
            ...newTestimonial,
            createdAt: Timestamp.now()
        });

        return NextResponse.json({
            success: true,
            proofofjoy: { id: docRef.id, ...newTestimonial }
        });
    } catch (error: any) {
        console.error('Error creating proofofjoy:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to submit proofofjoy' },
            { status: 500 }
        );
    }
}
);

export const PATCH = withMetrics(async function PATCH(req: NextRequest) {
    try {
        const data = await req.json();
        const { id, status, image } = data;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'ID is required' },
                { status: 400 }
            );
        }

        // Build update object based on what's provided
        const updateData: any = {
            updatedAt: Timestamp.now()
        };

        // Update status if provided
        if (status) {
            if (!['pending', 'approved', 'rejected'].includes(status)) {
                return NextResponse.json(
                    { success: false, error: 'Invalid status' },
                    { status: 400 }
                );
            }
            updateData.status = status;
        }

        // Update image if provided
        if (image !== undefined) {
            updateData.image = image;
        }

        await adminDb.collection('proofofjoys').doc(id).update(updateData);

        return NextResponse.json({ success: true, message: 'Testimonial updated' });
    } catch (error: any) {
        console.error('Error updating proofofjoy:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update proofofjoy' },
            { status: 500 }
        );
    }
}
);

export const DELETE = withMetrics(async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'ID is required' },
                { status: 400 }
            );
        }

        await adminDb.collection('proofofjoys').doc(id).delete();

        return NextResponse.json({ success: true, message: 'Testimonial deleted' });
    } catch (error: any) {
        console.error('Error deleting proofofjoy:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete proofofjoy' },
            { status: 500 }
        );
    }
}
);
