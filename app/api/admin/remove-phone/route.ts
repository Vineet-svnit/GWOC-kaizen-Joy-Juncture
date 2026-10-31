import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { phoneNumber } = body;

        if (!phoneNumber) {
            return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
        }

        console.log(`\n🔍 Searching for phone number: ${phoneNumber}`);

        // Find all users with this phone number
        const usersSnapshot = await adminDb.collection('users')
            .where('phoneNumber', '==', phoneNumber)
            .get();

        if (usersSnapshot.empty) {
            return NextResponse.json({
                success: true,
                message: 'No users found with this phone number',
                removed: 0
            });
        }

        console.log(`\n📱 Found ${usersSnapshot.size} user(s) with this phone number`);

        const userDetails = [];

        // Remove phone verification from all users
        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            userDetails.push({
                userId: doc.id,
                email: userData.email || 'N/A',
                name: userData.name || 'N/A',
                phoneVerified: userData.phoneVerified
            });

            await doc.ref.update({
                phoneNumber: null,
                phoneVerified: false,
                phoneUpdatedAt: null
            });

            console.log(`✅ Removed phone verification from user: ${doc.id}`);
        }

        return NextResponse.json({
            success: true,
            message: `Removed phone verification from ${usersSnapshot.size} user(s)`,
            removed: usersSnapshot.size,
            users: userDetails
        });

    } catch (error: any) {
        console.error('Error removing phone verification:', error);
        return NextResponse.json({
            error: 'Failed to remove phone verification',
            details: error.message
        }, { status: 500 });
    }
}
);
