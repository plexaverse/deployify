const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env.local') });

// Mock config to match app behavior
const config = {
    gcp: { projectId: process.env.GCP_PROJECT_ID },
    firebase: {
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    bigquery: {
        dataset: 'deployify_analytics_test',
        table: 'events_test',
    }
};

const { BigQuery } = require('@google-cloud/bigquery');

async function verify() {
    console.log('Verifying BigQuery Client...');
    try {
        const bq = new BigQuery({
            projectId: config.gcp.projectId,
            credentials: {
                client_email: config.firebase.clientEmail,
                private_key: config.firebase.privateKey,
            },
        });

        console.log('Fetching datasets...');
        const [datasets] = await bq.getDatasets();
        console.log(`Found ${datasets.length} datasets.`);

        // We won't actually create anything in this verification script to avoid clutter,
        // but we'll confirm the client can connect.
        console.log('✓ BigQuery Client connection successful.');
    } catch (e) {
        console.error('✗ BigQuery Verification Failed:', e.message);
    }
}

verify();
