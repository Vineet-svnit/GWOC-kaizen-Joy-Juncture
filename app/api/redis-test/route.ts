import { withMetrics } from '@/lib/api-metrics';
/**
 * Quick Redis Connection Test
 * This will write a test key to verify Redis is working
 */

import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export const GET = withMetrics(async function GET() {
    try {
        // Write a test key
        const testKey = 'test:connection:' + Date.now();
        await redis.set(testKey, 'Hello from Joy Juncture!', { ex: 300 }); // 5 min TTL

        // Read it back
        const value = await redis.get(testKey);

        // Get all keys (for debugging)
        const keys = await redis.keys('*');

        return NextResponse.json({
            success: true,
            message: '✅ Redis is connected and working!',
            testKey,
            testValue: value,
            allKeys: keys,
            keysCount: keys.length,
            instructions: 'Check your Upstash Data Browser - you should see the test key!',
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            hint: 'Check your UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env.local',
        }, { status: 500 });
    }
}
);
