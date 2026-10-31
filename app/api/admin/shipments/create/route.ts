import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue, Transaction } from 'firebase-admin/firestore';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(req: Request) {
    try {
        const body = await req.json();
        const { 
            orderId, 
            customerName, 
            customerEmail, 
            customerPhone, 
            courierName, 
            awbCode, 
            address, 
            weight, 
            status = 'NEW' 
        } = body;

        if (!orderId) {
            return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
        }

        // TODO: Add Admin Authentication check here if needed.
        // For now, assuming middleware or client-side protection + secure API route.

        const shipmentId = await adminDb.runTransaction(async (t: Transaction) => {

            const orderRef = adminDb.collection('orders').doc(orderId);
            const orderDoc = await t.get(orderRef);

            if (!orderDoc.exists) {
                throw new Error('Order not found');
            }

            const orderData = orderDoc.data();
            const shipmentRef = adminDb.collection('shipments').doc();
            
            // 2. Prepare Order Updates
            const orderUpdates: any = {
                shipmentId: shipmentRef.id,
                shipmentStatus: status,
                status: 'SHIPPED', // Explicitly mark order as SHIPPED
                updatedAt: FieldValue.serverTimestamp()
            };

            // 3. Conditional Stock Deduction Logic (READS FIRST)
            let productDocs: any[] = [];
            const items = orderData?.items || [];
            
            // If inventory was NOT deducted yet, we need to read products first
            if (!orderData?.inventory_deducted && items.length > 0) {
                 const productReads = items.map((item: any) => {
                    return t.get(adminDb.collection('products').doc(item.productId));
                });
                productDocs = await Promise.all(productReads);
            }

            // --- ALL READS DONE HERE ---

            // 1. Create Shipment (WRITE)
            t.set(shipmentRef, {
                orderId,
                customerName,
                customerEmail,
                customerPhone,
                courierName: courierName || null,
                awbCode: awbCode || null,
                address,
                weight: weight || null,
                status,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });

            // 3b. Apply Stock Deduction (WRITES)
            if (!orderData?.inventory_deducted && items.length > 0) {
                items.forEach((item: any, index: number) => {
                    const productDoc = productDocs[index];
                    if (productDoc && productDoc.exists) {
                        const currentSales = productDoc.data()?.sales || 0;
                        const currentStock = productDoc.data()?.stock || 0;
                        
                        t.update(productDoc.ref, {
                            stock: currentStock - item.quantity,
                            sales: currentSales + item.quantity
                        });
                    }
                });

                // Mark as deducted
                orderUpdates.inventory_deducted = true;
                console.log(`[Shipment API] Deducting stock for Order ${orderId} on shipment.`);
            } else {
                console.log(`[Shipment API] Stock already deducted for Order ${orderId}, skipping.`);
            }

            // 4. Update Order (WRITE)
            t.update(orderRef, orderUpdates);

            return shipmentRef.id;
        });

        return NextResponse.json({ 
            success: true, 
            shipmentId,
            message: 'Shipment created and order updated successfully' 
        });

    } catch (error: any) {
        console.error('Error creating shipment:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
);
