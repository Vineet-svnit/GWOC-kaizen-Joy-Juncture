import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import admin, { db, auth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(request: NextRequest) {
    try {
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            enquiryId,
            userId,
            amount,
            walletPointsUsed
        } = await request.json();

        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !enquiryId) {
            return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
        }

        /* ---------------- VERIFY SIGNATURE ---------------- */
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return NextResponse.json(
                { success: false, error: 'Invalid payment signature' },
                { status: 400 }
            );
        }

        /* ---------------- UPDATE DB ---------------- */
        const enquiryRef = db.collection('experience_enquiries').doc(enquiryId);
        const enquiryDoc = await enquiryRef.get();
        const enquiryData = enquiryDoc.exists ? enquiryDoc.data() : null;

        if (!enquiryData) {
            return NextResponse.json({ success: false, error: 'Enquiry not found' }, { status: 404 });
        }

        // 1. Deduct Points if used
        // 1. Deduct Points if used
        if (userId && walletPointsUsed > 0) {
            const userRef = db.collection('users').doc(userId);
            // Use admin.firestore().runTransaction because db wrapper doesn't expose it
            await admin.firestore().runTransaction(async (t: any) => {
                const userDoc = await t.get(userRef);
                if (userDoc.exists) {
                    const currentPoints = userDoc.data()?.points || 0;
                    if (currentPoints >= walletPointsUsed) {
                        t.update(userRef, { points: FieldValue.increment(-walletPointsUsed) });

                        // Log deduction
                        const transRef = userRef.collection('transactions').doc();
                        t.set(transRef, {
                            type: 'SPEND',
                            amount: walletPointsUsed,
                            source: 'EXPERIENCE_PAYMENT',
                            description: 'Redeemed for Experience Booking',
                            metadata: { enquiryId, orderId: razorpay_order_id },
                            timestamp: FieldValue.serverTimestamp()
                        });
                    } else {
                        throw new Error("Insufficient points balance");
                    }
                }
            });
        }

        // 2. Award XP/JP for purchase
        // Logic copied/adapted from event verify
        if (userId && amount) {
            try {
                const userRef = db.collection('users').doc(userId);
                const userSnap = await userRef.get();
                const userData = userSnap.exists ? userSnap.data() : {};
                const currentXP = userData?.xp || 0;

                // Fetch Settings
                const xpSettingsSnap = await db.collection('settings').doc('xpSystem').get();
                const xpSettings = xpSettingsSnap.exists ? xpSettingsSnap.data() : null;

                // Experiences Registration Reward Config (Flat Reward)
                const experienceXPSource = xpSettings?.xpSources?.find((s: any) => s.name.includes('Experiences Registration'));
                const baseXP = experienceXPSource?.baseXP || 60;
                const baseJP = experienceXPSource?.baseJP || 60;

                // XP is flat as per configured source
                const purchaseXP = baseXP;

                // Tier Config for JP Multiplier
                const TIERS = xpSettings?.tiers || [
                    { name: 'Newbie', minXP: 0, multiplier: 1.0 },
                    { name: 'Player', minXP: 500, multiplier: 1.1 },
                    { name: 'Strategist', minXP: 2000, multiplier: 1.25 },
                    { name: 'Grandmaster', minXP: 5000, multiplier: 1.5 }
                ];
                const currentTier = [...TIERS].reverse().find((tier: any) => currentXP >= tier.minXP) || TIERS[0];

                // JP is base * multiplier
                const purchaseJP = Math.floor(baseJP * currentTier.multiplier);

                if (purchaseXP > 0 || purchaseJP > 0) {
                    await userRef.update({
                        xp: FieldValue.increment(purchaseXP),
                        points: FieldValue.increment(purchaseJP)
                    });

                    await userRef.collection('transactions').add({
                        type: 'EARN',
                        amount: purchaseJP,
                        source: 'EXPERIENCE_REGISTRATION',
                        description: `Experience: ${enquiryData?.categoryName || 'Booking'} Reward`,
                        metadata: {
                            enquiryId,
                            xpEarned: purchaseXP,
                            amountPaid: amount / 100
                        },
                        timestamp: FieldValue.serverTimestamp()
                    });
                }
            } catch (e) {
                console.error("Error awarding points", e);
            }
        }

        // 3. Update Enquiry
        await enquiryRef.update({
            status: 'completed',
            paymentStatus: 'paid',
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
            pointsRedeemed: walletPointsUsed || 0,
            amountPaid: amount,
            paidAt: new Date(),
            updatedAt: new Date()
        });

        // 4. Send Email Notification
        // enquiryData is already fetched above

        if (enquiryData?.email) {
            const { sendEmail } = await import('@/lib/email-service');
            await sendEmail({
                to: enquiryData.email,
                subject: 'Experience Booked! 🎉',
                text: `Your experience "${enquiryData.categoryName}" is successfully booked. We will be in touch shortly with the itinerary.`,
                html: `
                <div style="font-family: sans-serif; color: #2D3436;">
                    <h1 style="color: #00B894;">You are going on an Adventure!</h1>
                    <p>Hi ${enquiryData.name || 'Explorer'},</p>
                    <p>Payment received with thanks! Your experience <strong>${enquiryData.categoryName}</strong> is now securely booked.</p>
                    <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
                    <p><strong>Amount Paid:</strong> ₹${amount / 100}</p>
                    ${walletPointsUsed ? `<p><strong>Points Redeemed:</strong> ${walletPointsUsed}</p>` : ''}
                    <p>Our team will contact you shortly with the final itinerary and details.</p>
                    <p>Stay Playful,<br>The Joy Juncture Team</p>
                </div>
            `
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Payment verified and booking confirmed',
        });

    } catch (error) {
        console.error('Error verifying experience payment:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
);
