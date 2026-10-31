import { NextRequest, NextResponse } from 'next/server';
import { getAboutData } from '@/lib/db/content';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(request: NextRequest) {
  try {
    const data = await getAboutData();

    // Return empty object if no data found instead of null
    return NextResponse.json({
      success: true,
      data: data || {
        // Provide a default structure if no data exists
        title: 'About Us',
        content: 'Content coming soon...',
      },
    });
  } catch (error: any) {
    console.error('Error fetching about data:', error);
    
    // Provide more detailed error information for debugging
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch about data',
        message: error.message,
        details: error.code || error.toString()
      },
      { status: 500 }
    );
  }
}
);
