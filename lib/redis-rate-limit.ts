/**
 * Rate Limiting Middleware
 * Uses sliding window algorithm for accurate rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { redis, RedisKeys, getWindowTimestamp } from './redis';
import { recordApiMetric } from './api-metrics';

export interface RateLimitConfig {
    /**
     * Maximum number of requests allowed in the window
     */
    maxRequests: number;

    /**
     * Time window in seconds
     */
    windowSeconds: number;

    /**
     * Custom identifier function (defaults to IP address)
     */
    identifier?: (req: NextRequest) => string | Promise<string>;

    /**
     * Endpoint name for the rate limit key
     */
    endpoint: string;
}

export interface RateLimitResult {
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
}

/**
 * Check if request is within rate limit
 */
export async function checkRateLimit(
    req: NextRequest,
    config: RateLimitConfig
): Promise<RateLimitResult> {
    try {
        // Get identifier (userId or IP)
        const identifier = config.identifier
            ? await config.identifier(req)
            : getClientIdentifier(req);

        // Get current window timestamp
        const window = getWindowTimestamp(config.windowSeconds);

        // Create rate limit key
        const key = RedisKeys.rateLimit(config.endpoint, identifier, window);

        // Increment counter
        const count = await redis.incr(key);

        // Set TTL on first request in window
        if (count === 1) {
            await redis.expire(key, config.windowSeconds);
        }

        // Calculate remaining and reset time
        const remaining = Math.max(0, config.maxRequests - count);
        const reset = window + config.windowSeconds;

        return {
            success: count <= config.maxRequests,
            limit: config.maxRequests,
            remaining,
            reset,
        };
    } catch (error) {
        console.error('Rate limit check error:', error);
        // Fail open - allow request if Redis is down
        return {
            success: true,
            limit: config.maxRequests,
            remaining: config.maxRequests,
            reset: Date.now() / 1000 + config.windowSeconds,
        };
    }
}

/**
 * Rate limit middleware wrapper
 */
export function withRateLimit(
    config: RateLimitConfig,
    handler: (req: NextRequest) => Promise<NextResponse>
) {
    return async (req: NextRequest): Promise<NextResponse> => {
        const startedAt = Date.now();
        const result = await checkRateLimit(req, config);

        // Add rate limit headers
        const headers = new Headers();
        headers.set('X-RateLimit-Limit', result.limit.toString());
        headers.set('X-RateLimit-Remaining', result.remaining.toString());
        headers.set('X-RateLimit-Reset', result.reset.toString());

        if (!result.success) {
            const response = NextResponse.json(
                {
                    error: 'Too many requests',
                    message: `Rate limit exceeded. Try again in ${Math.ceil(result.reset - Date.now() / 1000)} seconds.`,
                },
                {
                    status: 429,
                    headers,
                }
            );
            await recordApiMetric(req, response, startedAt);
            return response;
        }

        try {
            // Call handler and add headers to response
            const response = await handler(req);
            headers.forEach((value, key) => {
                response.headers.set(key, value);
            });

            await recordApiMetric(req, response, startedAt);
            return response;
        } catch (error) {
            const response = NextResponse.json(
                { error: 'Internal server error' },
                { status: 500, headers },
            );
            await recordApiMetric(req, response, startedAt);
            throw error;
        }
    };
}

/**
 * Get client identifier from request
 */
function getClientIdentifier(req: NextRequest): string {
    // Try to get IP from various headers
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const cfConnectingIp = req.headers.get('cf-connecting-ip');

    return (
        cfConnectingIp ||
        realIp ||
        forwarded?.split(',')[0].trim() ||
        'unknown'
    );
}

/**
 * Preset rate limit configurations
 */
export const RateLimitPresets = {
    // Strict limits for game endpoints
    game: {
        maxRequests: 10,
        windowSeconds: 60, // 10 requests per minute
    },

    // Moderate limits for API endpoints
    api: {
        maxRequests: 30,
        windowSeconds: 60, // 30 requests per minute
    },

    // Generous limits for read-only endpoints
    read: {
        maxRequests: 100,
        windowSeconds: 60, // 100 requests per minute
    },

    // Very strict for sensitive operations
    auth: {
        maxRequests: 5,
        windowSeconds: 300, // 5 requests per 5 minutes
    },
};
