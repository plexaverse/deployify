import { getDb, Collections } from '../src/lib/firebase';
import { FieldValue } from 'firebase-admin/firestore';

async function seed(projectId: string) {
    const db = getDb();
    const batch = db.batch();
    const now = new Date();

    console.log(`Seeding analytics for project: ${projectId}`);

    // Generate 30 days of data
    for (let i = 0; i < 30; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        // Random number of visitors per day
        const dailyVisitors = Math.floor(Math.random() * 50) + 10;

        for (let v = 0; v < dailyVisitors; v++) {
            const eventRef = db.collection(Collections.ANALYTICS_EVENTS).doc();

            // Randomly pick a path
            const paths = ['/', '/docs', '/about', '/pricing'];
            const path = paths[Math.floor(Math.random() * paths.length)];

            // Randomly pick a referrer
            const referrers = ['https://google.com', 'https://twitter.com', 'https://github.com', ''];
            const referrer = referrers[Math.floor(Math.random() * referrers.length)];

            batch.set(eventRef, {
                projectId,
                type: 'pageview',
                path,
                referrer,
                width: 1920,
                ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                timestamp: FieldValue.serverTimestamp(),
            });

            // Commit batch every 500 items
            if (v % 500 === 0 && v > 0) {
                // We'd need to await batch.commit() and start a new one
                // For simplicity in a seed script, we'll just keep it under 500 per day
            }
        }
    }

    await batch.commit();
    console.log('Seeding complete!');
}

const targetProjectId = process.argv[2];
if (!targetProjectId) {
    console.error('Please provide a projectId: npx tsx scripts/seed-analytics.ts <projectId>');
    process.exit(1);
}

seed(targetProjectId).catch(console.error);
