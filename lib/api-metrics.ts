import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const BUCKET_TTL_SECONDS = 7 * 24 * 60 * 60;
const BUCKET_INDEX_KEY = 'api-metrics:buckets';
const BUCKET_PREFIX = 'api-metrics:bucket:';
const LATENCY_PREFIX = 'api-metrics:latency:';

export interface ApiMetricSnapshot {
  bucket: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  statusCodes: Record<string, number>;
  requestsByEndpoint: Record<string, number>;
}

interface MetricHash {
  [key: string]: string | number | null;
}

function bucketStart(timestamp = Date.now()): number {
  return Math.floor(timestamp / 60_000) * 60_000;
}

function bucketId(timestamp = Date.now()): string {
  return String(bucketStart(timestamp));
}

function bucketKey(bucket: string): string {
  return `${BUCKET_PREFIX}${bucket}`;
}

function latencyKey(bucket: string): string {
  return `${LATENCY_PREFIX}${bucket}`;
}

function endpointKey(endpoint: string): string {
  return encodeURIComponent(endpoint);
}

function numberValue(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(
    values.length - 1,
    Math.ceil((percentileValue / 100) * values.length) - 1,
  );
  return values[Math.max(0, index)];
}

async function latencyStats(bucket: string): Promise<{
  average: number;
  p50: number;
  p95: number;
  p99: number;
}> {
  const values = (await redis.zrange(latencyKey(bucket), 0, -1)) as unknown;
  const latencies = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const average =
    latencies.length > 0
      ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
      : 0;

  return {
    average,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
  };
}

async function readBucket(bucket: string): Promise<ApiMetricSnapshot> {
  const data = (await redis.hgetall(bucketKey(bucket))) as MetricHash | null;
  const hash = data || {};
  const totalRequests = numberValue(hash.totalRequests);
  const successfulRequests = numberValue(hash.successfulRequests);
  const failedRequests = numberValue(hash.failedRequests);
  const statusCodes: Record<string, number> = {};
  const requestsByEndpoint: Record<string, number> = {};

  for (const [key, value] of Object.entries(hash)) {
    if (key.startsWith('status:')) {
      statusCodes[key.slice('status:'.length)] = numberValue(value);
    } else if (key.startsWith('endpoint:')) {
      requestsByEndpoint[decodeURIComponent(key.slice('endpoint:'.length))] =
        numberValue(value);
    }
  }

  const latency = await latencyStats(bucket);

  return {
    bucket,
    totalRequests,
    successfulRequests,
    failedRequests,
    errorRate: totalRequests > 0 ? failedRequests / totalRequests : 0,
    averageLatencyMs: latency.average,
    p50LatencyMs: latency.p50,
    p95LatencyMs: latency.p95,
    p99LatencyMs: latency.p99,
    statusCodes,
    requestsByEndpoint,
  };
}

export async function recordApiMetric(
  request: Request,
  response: Response,
  startedAt: number,
): Promise<void> {
  try {
    const bucket = bucketId(startedAt);
    const key = bucketKey(bucket);
    const endpoint =
      request instanceof NextRequest
        ? request.nextUrl.pathname
        : new URL(request.url).pathname;
    const status = response.status;
    const latencyMs = Math.max(0, Date.now() - startedAt);
    const pipeline = redis.pipeline();

    pipeline.hincrby(key, 'totalRequests', 1);
    pipeline.hincrby(
      key,
      response.status >= 200 && response.status < 400
        ? 'successfulRequests'
        : 'failedRequests',
      1,
    );
    pipeline.hincrby(key, `status:${status}`, 1);
    pipeline.hincrby(key, `endpoint:${endpointKey(endpoint)}`, 1);
    pipeline.expire(key, BUCKET_TTL_SECONDS);
    pipeline.zadd(latencyKey(bucket), {
      score: latencyMs,
      member: `${startedAt}-${Math.random().toString(36).slice(2)}`,
    });
    pipeline.expire(latencyKey(bucket), BUCKET_TTL_SECONDS);
    pipeline.zadd(BUCKET_INDEX_KEY, { score: Number(bucket), member: bucket });
    pipeline.expire(BUCKET_INDEX_KEY, BUCKET_TTL_SECONDS);
    await pipeline.exec();
  } catch (error) {
    console.warn('[Metrics] Failed to record API metric:', error);
  }
}

export function withMetrics<T extends (...args: never[]) => Promise<Response>>(
  handler: T,
): T {
  return (async (...args: Parameters<T>) => {
    const startedAt = Date.now();
    const request: unknown = args[0];
    try {
      const response = await handler(...args);
      if (request instanceof Request) {
        await recordApiMetric(request, response, startedAt);
      }
      return response;
    } catch (error) {
      const response = NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
      if (request instanceof Request) {
        await recordApiMetric(request, response, startedAt);
      }
      throw error;
    }
  }) as T;
}

export async function getLatestApiMetrics(): Promise<ApiMetricSnapshot> {
  return readBucket(bucketId());
}

export async function getApiMetricsHistory(
  from: number,
  to: number,
): Promise<ApiMetricSnapshot[]> {
  const bucketValues = (await redis.zrange(
    BUCKET_INDEX_KEY,
    from,
    to,
    { byScore: true },
  )) as unknown;

  return Promise.all(
    (Array.isArray(bucketValues) ? bucketValues : [])
      .map(String)
      .filter((bucket) => /^\d+$/.test(bucket))
      .map(readBucket),
  );
}
