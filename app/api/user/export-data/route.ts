import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';

import { withMetrics } from '@/lib/api-metrics';
export const GET = withMetrics(async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        // Fetch user data
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userData = userDoc.exists ? (userDoc.data() || {}) : {};

        // Fetch orders
        const ordersSnapshot = await adminDb
            .collection('orders')
            .where('userId', '==', userId)
            .get();
        const orders = ordersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        // Fetch wallet/points history
        const walletDoc = await adminDb.collection('wallets').doc(userId).get();
        const walletData = walletDoc.exists ? (walletDoc.data() || {}) : {};

        // Fetch event registrations
        const registrationsSnapshot = await adminDb
            .collection('event_registrations')
            .where('userId', '==', userId)
            .get();
        const registrations = registrationsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        // Fetch vouchers
        const vouchersSnapshot = await adminDb
            .collection('vouchers')
            .where('userId', '==', userId)
            .get();
        const vouchers = vouchersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        // Fetch activity/history
        const activitySnapshot = await adminDb
            .collection('users')
            .doc(userId)
            .collection('activity')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();
        const activity = activitySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        // Compile all data
        const exportData = {
            exportDate: new Date().toISOString(),
            userId: userId,
            profile: {
                email: userData.email || decodedToken.email,
                name: userData.name || '',
                phoneNumber: userData.phoneNumber || '',
                phoneVerified: userData.phoneVerified || false,
                role: userData.role || 'user',
                balance: userData.balance || 0,
                xp: userData.xp || 0,
                streak: userData.streak || null,
                createdAt: userData.created_at || null,
                lastSignIn: userData.last_sign_in_at || null,
            },
            orders: orders,
            wallet: walletData,
            eventRegistrations: registrations,
            vouchers: vouchers,
            recentActivity: activity,
            statistics: {
                totalOrders: orders.length,
                totalSpent: orders.reduce((sum: number, order: any) => sum + (order.totalPrice || 0), 0),
                totalPointsEarned: walletData.totalPoints || 0,
                eventsAttended: registrations.length,
                vouchersOwned: vouchers.length,
            },
        };

        // Return as JSON download
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });

        return new NextResponse(blob, {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="joy-juncture-data-${userId}.json"`,
            },
        });
    } catch (error) {
        console.error('Data export error:', error);
        return NextResponse.json(
            { error: 'Failed to export data', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
);
