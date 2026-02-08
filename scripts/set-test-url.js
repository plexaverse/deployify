const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase credentials in .env.local');
    process.exit(1);
}

initializeApp({
    credential: cert({
        projectId,
        clientEmail,
        privateKey,
    }),
});

const db = getFirestore();

async function updateProjectForTesting() {
    try {
        const projectsRef = db.collection('projects');
        const snapshot = await projectsRef.limit(10).get();

        if (snapshot.empty) {
            console.log('No projects found in Firestore');
            return;
        }

        const project = snapshot.docs.find(doc => doc.data().slug === 'deployify' || doc.data().name.toLowerCase().includes('deployify')) || snapshot.docs[0];

        console.log(`Updating project: ${project.data().name} (${project.id})`);
        console.log(`Current slug: ${project.data().slug}`);

        await projectsRef.doc(project.id).update({
            productionUrl: 'http://localhost:3001',
            updatedAt: new Date(),
        });

        console.log('Successfully updated productionUrl to http://localhost:3001');
        console.log(`Now visit: ${project.data().slug}.localhost:3000`);
    } catch (error) {
        console.error('Error updating project:', error);
    }
}

updateProjectForTesting();
