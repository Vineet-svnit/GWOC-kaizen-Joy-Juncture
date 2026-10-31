import { NextRequest, NextResponse } from 'next/server';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(request: NextRequest) {
  try {
    const { initializeFirebaseData } = await import('@/lib/initializeFirebaseData');
    const result = await initializeFirebaseData();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Initialization error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
);

export const GET = withMetrics(async function GET(request: NextRequest) {
  try {
    const { initializeFirebaseData } = await import('@/lib/initializeFirebaseData');
    const result = await initializeFirebaseData();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Initialization error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
);
