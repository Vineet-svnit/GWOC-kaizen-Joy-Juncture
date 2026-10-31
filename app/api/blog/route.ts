import { NextRequest, NextResponse } from 'next/server';
import { getBlogPosts } from '@/lib/db/blog';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const status = searchParams.get('status'); // 'all' to include drafts

    const posts = await getBlogPosts({
      ...(category ? { category } : {}),
      includeUnpublished: status === 'all',
    });

    return NextResponse.json({
      success: true,
      posts,
      count: posts.length
    });
  } catch (error: any) {
    console.error('Error fetching blog posts:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch blog posts',
        message: error.message 
      },
      { status: 500 }
    );
  }
}
);
