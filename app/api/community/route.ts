import { NextRequest, NextResponse } from 'next/server';
import { getCommunityData } from '@/lib/db/content';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(request: NextRequest) {
  try {
    const data = await getCommunityData();

    return NextResponse.json({
      success: true,
      data: data || {},
    });
  } catch (error: any) {
    console.error('Error fetching community data:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch community data',
        message: error.message 
      },
      { status: 500 }
    );
  }
}
);
