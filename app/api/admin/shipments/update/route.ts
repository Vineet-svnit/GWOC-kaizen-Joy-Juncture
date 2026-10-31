import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue, Transaction } from 'firebase-admin/firestore';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(req: Request) {
    try {
        const body = await req.json();
        const { shipmentId, status } = body;

        if (!shipmentId || !status) {
            return NextResponse.json({ error: 'Shipment ID and Status are required' }, { status: 400 });
        }

        await adminDb.runTransaction(async (t: Transaction) => {
            const shipmentRef = adminDb.collection('shipments').doc(shipmentId);
            const shipmentDoc = await t.get(shipmentRef);

            if (!shipmentDoc.exists) {
                throw new Error('Shipment not found');
            }

            const shipmentData = shipmentDoc.data();
            const orderId = shipmentData?.orderId;
            const orderRef = orderId ? adminDb.collection('orders').doc(orderId) : null;
            let orderData: any = null;

            if (orderRef) {
                const orderDoc = await t.get(orderRef);
                orderData = orderDoc.exists ? orderDoc.data() : null;
            }

            // 1. Update Shipment Status
            t.update(shipmentRef, {
                status,
                updatedAt: FieldValue.serverTimestamp()
            });

            // 2. Update Order Status (if linked)
            if (orderRef && orderData) {
                const orderUpdates: any = {
                    shipmentStatus: status,
                    // If returning, we might want to mark the main status as returned too
                    status: status === 'RETURNED' ? 'RETURNED' : (status === 'DELIVERED' ? 'DELIVERED' : orderData.status),
                    updatedAt: FieldValue.serverTimestamp()
                };

                // 3. Stock Restoration Logic for Returns
                if (status === 'RETURNED') {
                    // Only restore if it was previously deducted
                    if (orderData.inventory_deducted) {
                        const items = orderData.items || [];
                        if (items.length > 0) {
                            const productReads = items.map((item: any) => {
                                return t.get(adminDb.collection('products').doc(item.productId));
                            });

                            const productDocs = await Promise.all(productReads);

                            items.forEach((item: any, index: number) => {
                                const productDoc = productDocs[index];
                                if (productDoc.exists) {
                                    const currentSales = productDoc.data()?.sales || 0;
                                    const currentStock = productDoc.data()?.stock || 0;

                                    t.update(productDoc.ref, {
                                        stock: currentStock + item.quantity,
                                        sales: Math.max(0, currentSales - item.quantity)
                                    });
                                }
                            });

                            // Critical: Reset the flag so if we ship it again, we deduct again.
                            orderUpdates.inventory_deducted = false;
                            console.log(`[Shipment Update] Restored stock for Order ${orderId} (Returned).`);
                        }
                    } else {
                        console.log(`[Shipment Update] Order ${orderId} returned but inventory was not deducted. Skipping restoration.`);
                    }
                }

                t.update(orderRef, orderUpdates);
            }
        });

        return NextResponse.json({ success: true, message: 'Status updated successfully' });

    } catch (error: any) {
        console.error('Error updating shipment:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
);
