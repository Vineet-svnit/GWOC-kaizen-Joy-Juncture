import { NextRequest, NextResponse } from 'next/server';
import { getLatestApiMetrics, withMetrics } from '@/lib/api-metrics';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.METRICS_API_KEY;
  const authorization = request.headers.get('authorization');
  return Boolean(
    expected &&
      authorization === `Bearer ${expected}`,
  );
}

export const GET = withMetrics(async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(await getLatestApiMetrics());
});
