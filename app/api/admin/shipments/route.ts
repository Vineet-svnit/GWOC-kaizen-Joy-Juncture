import { withMetrics } from '@/lib/api-metrics';

import { NextRequest, NextResponse } from 'next/server';
import { getShipments } from '@/lib/db/shipments';

export const GET = withMetrics(async function GET() {
  try {
    const shipments = await getShipments();
    console.log('API Shipments Data:', JSON.stringify(shipments, null, 2));
    console.log('Is Array?', Array.isArray(shipments));
    return NextResponse.json(shipments);
  } catch (error: any) {
    console.error('API Error:', error);
    const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown error occurred');
    const errorStack = error?.stack || '';
    return NextResponse.json(
        { 
            message: errorMessage,
            details: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            stack: errorStack
        }, 
        { status: 500 }
    );
  }
}
);
