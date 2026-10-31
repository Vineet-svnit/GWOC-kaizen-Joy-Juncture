import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { headers } from 'next/headers';

import { withMetrics } from '@/lib/api-metrics';
// POST /api/admin/initialize-xp-system - Initialize XP system with default settings
export const POST = withMetrics(async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const authorization = headersList.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authorization.split('Bearer ')[1];
    let decodedToken;
    
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if user is admin
    const userRef = adminDb.collection('users').doc(decodedToken.uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists || (!userSnap.data()?.isAdmin && userSnap.data()?.role !== 'admin')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Check if XP system already exists
    const xpSystemRef = adminDb.doc('settings/xpSystem');
    const xpSystemSnap = await xpSystemRef.get();

    if (xpSystemSnap.exists) {
      return NextResponse.json({
        success: false,
        message: 'XP system already initialized. Use the admin panel to modify settings.',
        existingData: xpSystemSnap.data()
      });
    }

    // Initialize with default settings
    const defaultSettings = {
      tiers: [
        {
          name: 'Newbie',
          minXP: 0,
          multiplier: 1.0,
          badge: 'Grey Meeple',
          perk: 'None',
          color: '#94a3b8',
          icon: '♟️',
          unlockPrice: 0
        },
        {
          name: 'Player',
          minXP: 500,
          multiplier: 1.1,
          badge: 'Green Pawn',
          perk: 'Early access to Event Tickets',
          color: '#34d399',
          icon: '♟️',
          unlockPrice: 2000
        },
        {
          name: 'Strategist',
          minXP: 2000,
          multiplier: 1.25,
          badge: 'Blue Rook',
          perk: '5% off all Workshops',
          color: '#60a5fa',
          icon: '♜',
          unlockPrice: 5000
        },
        {
          name: 'Grandmaster',
          minXP: 5000,
          multiplier: 1.5,
          badge: 'Gold Crown',
          perk: 'VIP Seating at Game Nights',
          color: '#fbbf24',
          icon: '👑',
          unlockPrice: 10000
        }
      ],
      xpSources: [
        { name: 'Shop Purchase (per ₹100)', baseXP: 10, enabled: true },
        { name: 'Event Registration', baseXP: 50, enabled: true },
        { name: 'Workshop Registration', baseXP: 75, enabled: true },
        { name: 'Game Night Attendance', baseXP: 100, enabled: true }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await xpSystemRef.set(defaultSettings);

    return NextResponse.json({
      success: true,
      message: 'XP system initialized successfully!',
      data: defaultSettings
    });

  } catch (error: any) {
    console.error('Error initializing XP system:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
);

// GET /api/admin/initialize-xp-system - Check if XP system is initialized
export const GET = withMetrics(async function GET(req: NextRequest) {
  try {
    const xpSystemRef = adminDb.doc('settings/xpSystem');
    const xpSystemSnap = await xpSystemRef.get();

    return NextResponse.json({
      initialized: xpSystemSnap.exists,
      data: xpSystemSnap.exists ? xpSystemSnap.data() : null
    });

  } catch (error: any) {
    console.error('Error checking XP system:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
);
