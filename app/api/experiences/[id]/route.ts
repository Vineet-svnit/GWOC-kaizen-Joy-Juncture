import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase-admin';
import { ExperienceCategory } from '@/lib/types';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

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

    /* ---------------- GET CATEGORY ---------------- */
    const categoryDoc = await db.collection('experience_categories').doc(id).get();

    if (!categoryDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Category not found' },
        { status: 404 }
      );
    }

    const category = {
      id: categoryDoc.id,
      ...categoryDoc.data(),
      createdAt: categoryDoc.data()?.createdAt?.toDate(),
      updatedAt: categoryDoc.data()?.updatedAt?.toDate(),
    } as ExperienceCategory;

    return NextResponse.json({
      success: true,
      category,
    });
  } catch (error) {
    console.error('Error fetching experience category:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
);

export const PATCH = withMetrics(async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

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

    /* ---------------- UPDATE CATEGORY ---------------- */
    const updates = await request.json();

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No update data provided' },
        { status: 400 }
      );
    }

    // Filter out empty array items if arrays are being updated
    const cleanedUpdates: any = {
      ...updates,
      updatedAt: new Date(),
    };

    if (Array.isArray(updates.problemsSolved)) {
      cleanedUpdates.problemsSolved = updates.problemsSolved.filter((item: string) => item.trim());
    }

    if (Array.isArray(updates.gamesFormats)) {
      cleanedUpdates.gamesFormats = updates.gamesFormats.filter((item: string) => item.trim());
    }

    if (Array.isArray(updates.imageGallery)) {
      cleanedUpdates.imageGallery = updates.imageGallery.filter((item: string) => item.trim());
    }

    await db.collection('experience_categories').doc(id).update(cleanedUpdates);

    // Get updated category
    const updatedDoc = await db.collection('experience_categories').doc(id).get();
    const updatedCategory = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      createdAt: updatedDoc.data()?.createdAt?.toDate(),
      updatedAt: updatedDoc.data()?.updatedAt?.toDate(),
    } as ExperienceCategory;

    return NextResponse.json({
      success: true,
      category: updatedCategory,
    });
  } catch (error) {
    console.error('Error updating experience category:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
);

export const DELETE = withMetrics(async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

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

    /* ---------------- DELETE CATEGORY ---------------- */
    await db.collection('experience_categories').doc(id).delete();

    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting experience category:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
);