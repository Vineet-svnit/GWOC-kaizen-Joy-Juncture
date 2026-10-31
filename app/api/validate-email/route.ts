import { NextResponse } from 'next/server';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const API_KEY = process.env.ABSTRACT_API_KEY;

    if (!API_KEY) {
        console.warn('ABSTRACT_API_KEY is not defined. Skipping email validation.');
        // Allow if api key is missing to prevent breaking the app during dev/deployment if env var is forgotten
        return NextResponse.json({ isValid: true });
    }

    try {
        const response = await fetch(`https://emailreputation.abstractapi.com/v1/?api_key=${API_KEY}&email=${email}`);

        if (!response.ok) {
            throw new Error(`Abstract API error: ${response.statusText}`);
        }

        const data = await response.json();

        // Check if disposable
        // Abstract Email Reputation API returns email_quality.is_disposable
        const isDisposable = data.email_quality?.is_disposable === true;
        const deliverability = data.deliverability;

        if (isDisposable) {
            return NextResponse.json({
                isValid: false,
                error: 'Disposable email addresses are not allowed. Please use a valid email.'
            });
        }

        if (deliverability === "UNDELIVERABLE") {
            return NextResponse.json({
                isValid: false,
                error: 'This email address appears to be undeliverable. Please check for typos.'
            });
        }

        return NextResponse.json({ isValid: true });

    } catch (error) {
        console.error('Email validation error:', error);
        // Fail open - allow potential signups if the validation service is down
        return NextResponse.json({ isValid: true });
    }
}
);
