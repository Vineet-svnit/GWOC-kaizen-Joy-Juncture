import { NextRequest, NextResponse } from 'next/server';
import { getApiMetricsHistory, withMetrics } from '@/lib/api-metrics';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.METRICS_API_KEY;
  const authorization = request.headers.get('authorization');
  return Boolean(
    expected &&
      authorization === `Bearer ${expected}`,
  );
}

function parseTimestamp(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

export const GET = withMetrics(async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const { searchParams } = new URL(request.url);
  const from = parseTimestamp(
    searchParams.get('from'),
    now - 60 * 60 * 1000,
  );
  const to = parseTimestamp(searchParams.get('to'), now);
  const interval = searchParams.get('interval') || '1m';

  if (interval !== '1m' || from > to) {
    return NextResponse.json(
      { error: 'Only interval=1m is supported and from must be before to' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    interval,
    metrics: await getApiMetricsHistory(from, to),
  });
});
