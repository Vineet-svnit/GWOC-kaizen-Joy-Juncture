import { withMetrics } from '@/lib/api-metrics';
/**
 * API Route to Initialize Mock Data
 * Call GET /api/admin/init-mock-data to populate Firestore with demo data
 */

import { NextResponse } from 'next/server';

export const GET = withMetrics(async function GET() {
  try {
    // Dynamically import to avoid Firebase initialization at build time
    const { initializeAllMockData } = await import('@/lib/initMockData');
    await initializeAllMockData();
    return NextResponse.json({
      success: true,
      message: 'Mock data initialized successfully',
    });
  } catch (error) {
    console.error('Error initializing mock data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initialize mock data',
      },
      { status: 500 }
    );
  }
}
);
