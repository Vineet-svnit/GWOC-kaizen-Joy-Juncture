import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';

import { withMetrics } from '@/lib/api-metrics';
export const dynamic = 'force-dynamic'; // Disable caching for live feel

export const GET = withMetrics(async function GET() {
  try {
    const messages: string[] = [];
    const now = new Date();

    // 1. Fetch Upcoming Event
    try {
      const eventsParams = await adminDb
        .collection('events')
        .where('datetime', '>', now)
        .orderBy('datetime', 'asc')
        .limit(1)
        .get();

      if (!eventsParams.empty) {
        const event = eventsParams.docs[0].data();
        const eventDate = event.datetime.toDate();
        const diffHours = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60));
        
        let timeString = `in ${diffHours} hours`;
        if (diffHours < 1) timeString = "starting soon";
        if (diffHours > 24) timeString = "this weekend"; // Simplified logic

        messages.push(`🎉 Upcoming Event: '${event.title}' ${timeString}.`);
      }
    } catch (e) {
      console.error("Error fetching events:", e);
    }

    // 2. Fetch Latest Product Drop
    try {
      const productsParams = await adminDb
        .collection('products')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (!productsParams.empty) {
        const product = productsParams.docs[0].data();
        messages.push(`⚡ New Item Drop: ${product.name} is selling fast!`);
      }
    } catch (e) {
      console.error("Error fetching products:", e);
    }

    // 3. Fetch Recent High Score (Simulated from Leaderboard or just random if empty)
    // Real implementation would query a 'game_activity' collection
    try {
        // Checking for a generic leaderboard or recent game play
        // Since we don't have a guaranteed public 'gamePlays' feed, we might skip or use a known one
        // For now, we'll try to find a recent valid score if any exists, otherwise fallback to generic
        const plays = await adminDb.collection('leaderboards').limit(1).get(); // Just ensuring collection exists
        if(plays) {
             // If we had real user names, we'd use them. 
             // For safety/privacy, we might mask names unless they are public profiles.
             // messages.push("🏆 Alex just scored 2048 in Classic Mode!"); 
             // Leaving this static-like for now until we have real game data structure confirmed
        }
    } catch (e) {
        console.error("Error fetching scores:", e);
    }
    
    // 4. Add Simulated Real-time Stats (as requested placeholders validation)
    const randomViewers = Math.floor(Math.random() * (45 - 12) + 12);
    messages.push(`👀 ${randomViewers} people are looking at Chess right now.`);

    // Fallbacks if DB is empty
    if (messages.length === 0) {
        messages.push("🔥 Welcome to Joy Juncture!");
        messages.push("🎲 Play Chess to earn XP!");
    }

    // Shuffle messages slightly? No, keep order or random.
    // Let's add some default flavor if only 1 message
    if (messages.length < 3) {
         messages.push("🏆 Join the weekly tournament to win prizes!");
    }

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Social Pulse API Error:', error);
    // Fallback on error
    return NextResponse.json({ 
        messages: [
            "🔥 Welcome to Joy Juncture!",
            "⚡ Shop the latest collection now."
        ] 
    });
  }
}
);
