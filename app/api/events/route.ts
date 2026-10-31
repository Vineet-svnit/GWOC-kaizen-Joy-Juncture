import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin'
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

import { withMetrics } from '@/lib/api-metrics';
export const runtime = 'nodejs';


export const GET = withMetrics(async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as 'past' | 'upcoming' | null;

    const now = Timestamp.fromDate(new Date());

    let queryRef: FirebaseFirestore.Query;

    if (status === 'upcoming' || !status) {
      queryRef = adminDb
        .collection('events')
        .where('datetime', '>', now)
        .orderBy('datetime', 'asc');
    } else {
      queryRef = adminDb
        .collection('events')
        .where('datetime', '<=', now)
        .orderBy('datetime', 'desc');
    }

    const snapshot = await queryRef.get();

    const events = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        datetime: data.datetime?.toDate(),
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      };
    });

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error: any) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch events',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
);


export const POST = withMetrics(async function POST(req: NextRequest) {
  try {


    // 1️⃣ AUTH CHECK
    const token = req.headers
      .get('authorization')
      ?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const snap = await adminDb.doc(`users/${uid}`).get();

    if (snap.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }


    // 3️⃣ PAYLOAD
    const body = await req.json();
    const {
      title,
      description,
      image,
      datetime,
      status,
      location,
      registered,
      capacity,
      price,
      highlights,
      testimonials,
      gallery,
      category,
    } = body;

    if (!title || !description || !datetime || !location || capacity === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const payload: any = {
      title,
      description,
      datetime: Timestamp.fromDate(new Date(datetime)),
      location,
      status: status ?? 'upcoming',
      registered: 0,
      capacity: Number(capacity),
      category: category ?? 'Other',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (price !== undefined) payload.price = Number(price);
    if (image !== undefined) payload.image = image;

    if (status === 'past') {
      if (highlights) payload.highlights = highlights;
      if (testimonials) payload.testimonials = testimonials;
      if (gallery) payload.gallery = gallery;
    }

    // 4️⃣ ADMIN DB WRITE
    const docRef = await adminDb.collection('events').add(payload);

    return NextResponse.json(
      { success: true, id: docRef.id },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[POST /api/events]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create event' },
      { status: 500 }
    );
  }
}
);
