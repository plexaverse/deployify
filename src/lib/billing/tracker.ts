import { getDb, Collections } from '@/lib/firebase';
import { FieldValue } from 'firebase-admin/firestore';

export async function trackDeployment(projectId: string, buildDurationMs: number): Promise<void> {
    const db = getDb();
    const buildMinutes = Math.ceil(buildDurationMs / 60000);

    // We'll update the usage document for the project
    // Using atomic increments to ensure accuracy
    await db.collection(Collections.USAGE).doc(projectId).set({
        deploymentCount: FieldValue.increment(1),
        buildMinutes: FieldValue.increment(buildMinutes),
        lastDeploymentAt: new Date(),
    }, { merge: true });
}
