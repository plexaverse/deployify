/* eslint-disable @typescript-eslint/no-require-imports */
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase credentials in .env.local');
    process.exit(1);
}

// Initialize Admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
        }),
    });
}

const db = admin.firestore();

async function run() {
    console.log('Fetching projects...');
    const projectsSnapshot = await db.collection('projects').get();

    if (projectsSnapshot.empty) {
        console.log('No projects found in database. Please create a project first.');
        process.exit(0);
    }

    const projects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`Found ${projects.length} projects.`);

    for (const project of projects) {
        console.log(`Seeding analytics for: ${project.name} (${project.id})`);
        const batch = db.batch();
        const now = new Date();

        // Generate 30 days of data
        for (let i = 0; i < 30; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);

            // Random number of visitors per day
            const dailyVisitors = Math.floor(Math.random() * 40) + 10;

            for (let v = 0; v < dailyVisitors; v++) {
                const eventRef = db.collection('analytics_events').doc();

                // Randomly pick a path
                const paths = ['/', '/docs', '/about', '/pricing', '/blog'];
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const pathStr = paths[Math.floor(Math.random() * paths.length)];

                // Randomly pick a referrer
                const referrers = ['https://google.com', 'https://twitter.com', 'https://github.com', 'https://news.ycombinator.com', ''];
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const referrer = referrers[Math.floor(Math.random() * referrers.length)];

                // Randomly pick an IP range
                const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

                // Distribute timestamps throughout the day
                const timestamp = new Date(date);
                timestamp.setHours(Math.floor(Math.random() * 24));
                timestamp.setMinutes(Math.floor(Math.random() * 60));

                batch.set(eventRef, {
                    projectId: project.id,
                    type: 'pageview',
                    path: paths[Math.floor(Math.random() * paths.length)],
                    referrer: referrers[Math.floor(Math.random() * referrers.length)],
                    ip: ip, // Using the 'ip' variable defined above
                    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    timestamp: admin.firestore.Timestamp.fromDate(timestamp),
                });

                // Add a vitals event for some visitors
                if (Math.random() > 0.3) {
                    const vitalsRef = db.collection('analytics_events').doc();
                    batch.set(vitalsRef, {
                        projectId: project.id,
                        type: 'vitals',
                        metrics: {
                            lcp: 800 + Math.random() * 3000,
                            cls: Math.random() * 0.3,
                            fid: 5 + Math.random() * 200,
                            fcp: 400 + Math.random() * 2000,
                            ttfb: 10 + Math.random() * 500,
                        },
                        timestamp: admin.firestore.Timestamp.fromDate(timestamp),
                    });
                }
            }
        }

        await batch.commit();
        console.log(`Successfully seeded ${project.name}`);
    }

    console.log('All projects seeded successfully!');
}

run().catch(console.error);
