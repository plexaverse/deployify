const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

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

function generateApiKey() {
    return 'dp_' + crypto.randomBytes(24).toString('hex');
}

async function run() {
    console.log('Generating analytics API keys for projects...');
    const snapshot = await db.collection('projects').get();

    if (snapshot.empty) {
        console.log('No projects found.');
        return;
    }

    const batch = db.batch();
    let count = 0;

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (!data.analyticsApiKey) {
            console.log(`- Adding key to project: ${data.name} (${doc.id})`);
            batch.update(doc.ref, {
                analyticsApiKey: generateApiKey(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            count++;
        } else {
            console.log(`- Project already has key: ${data.name} (${doc.id})`);
        }
    });

    if (count > 0) {
        await batch.commit();
        console.log(`Successfully added API keys to ${count} projects.`);
    } else {
        console.log('All projects already have API keys.');
    }
}

run().catch(console.error);
