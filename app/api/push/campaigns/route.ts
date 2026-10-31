import { db, auth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { sendNotifications } from '@/lib/notification-service';

import { withMetrics } from '@/lib/api-metrics';
export const POST = withMetrics(async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);

    if (!decodedToken.uid) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if user is admin
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const userEmail = decodedToken.email || userDoc.data()?.email;

    const body = await request.json();
    const {
      title,
      message,
      image,
      icon,
      actionUrl,
      actionType = 'navigate',
      recipientSegment = 'all',
      customFilters,
      scheduledFor,
      priority = 'normal',
      channels = ['push', 'in-app'], // Default channels if not provided
    } = body;

    // Validate required fields
    if (!title || !message) {
      return Response.json(
        { error: 'Title and message are required' },
        { status: 400 }
      );
    }

    // Validate length constraints
    if (title.length > 65) {
      return Response.json(
        { error: 'Title must be 65 characters or less' },
        { status: 400 }
      );
    }

    if (message.length > 240) {
      return Response.json(
        { error: 'Message must be 240 characters or less' },
        { status: 400 }
      );
    }

    // Get recipient count based on segment
    let query: any = db.collection('users');

    if (recipientSegment === 'first-time') {
      query = query.where('isFirstTimeCustomer', '==', true);
    } else if (recipientSegment === 'loyal') {
      query = query.where('currentLevel', '>=', 3);
    } else if (recipientSegment === 'inactive') {
      // Last purchase more than 30 days ago
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query = query.where('lastPurchaseAt', '<', Timestamp.fromDate(thirtyDaysAgo));
    } else if (recipientSegment === 'custom' && customFilters) {
      if (customFilters.minSpending) {
        query = query.where('totalSpent', '>=', customFilters.minSpending);
      }
      if (customFilters.maxSpending) {
        query = query.where('totalSpent', '<=', customFilters.maxSpending);
      }
      if (customFilters.purchaseCount) {
        query = query.where('purchaseCount', '>=', customFilters.purchaseCount);
      }
      if (customFilters.levels && customFilters.levels.length > 0) {
        query = query.where('currentLevel', 'in', customFilters.levels);
      }
    }

    const recipientSnapshot = await query.get();
    const recipientCount = recipientSnapshot.size;

    if (recipientCount === 0) {
      return Response.json(
        { error: 'No recipients found for this segment' },
        { status: 400 }
      );
    }

    // Create campaign
    const campaignRef = await db.collection('pushCampaigns').add({
      title,
      message,
      description: body.description || '',
      image: image || null,
      icon: icon || null,
      actionUrl: actionUrl || null,
      actionType,
      recipientSegment,
      customFilters: customFilters || null,
      // scheduledFor comes as datetime-local string (local time), convert to UTC Timestamp
      // The datetime-local input provides local time, which is correctly converted to UTC by Timestamp.fromDate
      scheduledFor: scheduledFor ? Timestamp.fromDate(new Date(scheduledFor)) : null,
      status: scheduledFor ? 'scheduled' : 'sent',
      sentAt: scheduledFor ? null : Timestamp.now(),
      priority,
      channels: channels || ['push', 'in-app'], // Store channels for scheduled notifications
      ttl: body.ttl || 86400, // 24 hours default
      recipientCount,
      deliveredCount: 0,
      failedCount: 0,
      interactionCount: 0,
      createdBy: userEmail,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Also add to the legacy 'campaigns' collection for immediate UI visibility
    const legacyCampaignRef = await db.collection('campaigns').add({
      title,
      message,
      status: scheduledFor ? 'scheduled' : 'sent',
      recipientCount,
      deliveredCount: 0,
      interactionCount: 0,
      priority,
      image: image || null,
      actionUrl: actionUrl || null,
      createdAt: new Date().toISOString(),
      scheduledFor: scheduledFor || null,
      pushCampaignId: campaignRef.id // Link them
    });

    // If not scheduled, send immediately
    if (!scheduledFor) {
      try {
        const results = await sendNotifications({
          title,
          message,
          type: actionType,
          actionUrl,
          image,
          recipientSegment,
          channels: body.channels || ['push', 'in-app'],
          priority
        });

        // Update campaign with delivery results
        await campaignRef.update({
          deliveredCount: results.pushSentCount,
          updatedAt: Timestamp.now(),
        });

        // Update the legacy record as well
        await legacyCampaignRef.update({
          deliveredCount: results.pushSentCount
        });
      } catch (sendError) {
        console.error('Error sending immediate campaign:', sendError);
      }
    }

    return Response.json({
      success: true,
      campaignId: campaignRef.id,
      recipientCount,
      message: scheduledFor
        ? `Campaign scheduled for ${new Date(scheduledFor).toLocaleString()}`
        : `Campaign sent to ${recipientCount} recipients`,
    });
  } catch (error) {
    console.error('Campaign creation error:', error);
    return Response.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
}
);

