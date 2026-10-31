import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

import { withMetrics } from '@/lib/api-metrics';
cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const GET = withMetrics(async function GET() {
    try {
        const result = await cloudinary.api.resources({
            max_results: 100,
            direction: 'desc'
        });
        return NextResponse.json(result.resources);
    } catch (error) {
        console.error('Error fetching Cloudinary resources:', error);
        return NextResponse.json({ error: 'Failed to fetch resources' }, { status: 500 });
    }
}
);

export const DELETE = withMetrics(async function DELETE(request: Request) {
    try {
        const { public_id } = await request.json();

        if (!public_id) {
            return NextResponse.json({ error: 'Public ID is required' }, { status: 400 });
        }

        const result = await cloudinary.uploader.destroy(public_id);

        if (result.result === 'ok') {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Failed to delete from Cloudinary', details: result }, { status: 500 });
        }
    } catch (error) {
        console.error('Error deleting Cloudinary resource:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
);
