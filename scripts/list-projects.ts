import 'dotenv/config';
import { getDb, Collections } from '../src/lib/firebase';

async function listProjects() {
    const db = getDb();
    console.log('Fetching projects...');
    const snapshot = await db.collection(Collections.PROJECTS).get();

    if (snapshot.empty) {
        console.log('No projects found.');
        return;
    }

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`- Project Name: ${data.name}`);
        console.log(`  ID: ${doc.id}`);
        console.log(`  Slug: ${data.slug}`);
        console.log('---');
    });
}

listProjects().catch(console.error);
