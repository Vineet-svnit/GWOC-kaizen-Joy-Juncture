import { withMetrics } from '@/lib/api-metrics';

import { NextRequest, NextResponse } from 'next/server';
import { getShipmentById } from '@/lib/db/shipments';

export const GET = withMetrics(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const shipmentId = (await params).id;
    const shipment = await getShipmentById(shipmentId);

    if (!shipment) {
      return NextResponse.json({ message: 'Shipment not found' }, { status: 404 });
    }

    return NextResponse.json(shipment);
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
);
