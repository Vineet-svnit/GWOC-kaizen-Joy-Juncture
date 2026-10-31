import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/app/api/auth/firebase-admin';

import { withMetrics } from '@/lib/api-metrics';
export const dynamic = 'force-dynamic';

const DEFAULT_SETTINGS = {
  // Gamification
  pointsPerRupee: 1,
  firstTimeBonusPoints: 100,
  firstTimeThreshold: 500,
  redeemRate: 0.5,
  maxRedeemPercent: 50,
  referralBonus: 50,
  birthdayBonus: 100,

  // Payment
  gstRate: 18,
  shippingCost: 50,
  freeShippingThreshold: 500,

  // General
  storeName: 'Joy Juncture',
  storeEmail: 'support@joyjuncture.com',
  storePhone: '+91-XXXXXXXXXX',
  currency: 'INR',
};

export const GET = withMetrics(async function GET(request: NextRequest) {
  try {
    // Optionally verify admin token for sensitive settings
    // For now, let's keep it open for the checkout page but we might want to split it later

    // Get settings from Firestore
    const settingsDoc = await adminDb.collection('settings').doc('store').get();

    if (!settingsDoc.exists) {
      return NextResponse.json(DEFAULT_SETTINGS);
    }

    const data = settingsDoc.data();
    return NextResponse.json({
      ...DEFAULT_SETTINGS,
      ...data
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(DEFAULT_SETTINGS, { status: 200 });
  }
}
);
