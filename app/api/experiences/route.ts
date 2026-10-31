import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase-admin';
import { ExperienceCategory } from '@/lib/types';

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

    /* ---------------- GET CATEGORIES ---------------- */
    const categoriesSnap = await db
      .collection('experience_categories')
      .orderBy('createdAt', 'desc')
      .get();

    const categories = categoriesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as ExperienceCategory[];

    return NextResponse.json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error('Error fetching experience categories:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
);

export const POST = withMetrics(async function POST(request: NextRequest) {
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

    /* ---------------- CREATE CATEGORY ---------------- */
    const data = await request.json();

    // Validate required fields
    const requiredFields = ['name', 'slug', 'shortDescription', 'image', 'whoFor'];
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json(
          { success: false, error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    // Filter out empty array items
    const cleanedData = {
      ...data,
      problemsSolved: data.problemsSolved?.filter((item: string) => item.trim()) || [],
      gamesFormats: data.gamesFormats?.filter((item: string) => item.trim()) || [],
      imageGallery: data.imageGallery?.filter((item: string) => item.trim()) || [],
      testimonials: data.testimonials || [],
      published: data.published || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection('experience_categories').add(cleanedData);

    return NextResponse.json({
      success: true,
      category: {
        id: docRef.id,
        ...cleanedData,
      },
    });
  } catch (error) {
    console.error('Error creating experience category:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
);