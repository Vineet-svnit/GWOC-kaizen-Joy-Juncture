import { NextRequest, NextResponse } from 'next/server';
import { LogAggregator } from '@/lib/log-aggregator';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(req: NextRequest) {
    try {
        const stats = await LogAggregator.getStats();
        return NextResponse.json({ stats });
    } catch (error) {
        console.error('Failed to get log stats:', error);
        return NextResponse.json(
            { error: 'Failed to get stats' },
            { status: 500 }
        );
    }
}
);
