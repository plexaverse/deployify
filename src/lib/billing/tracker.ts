import { FieldValue } from 'firebase-admin/firestore';
import { getDb, Collections } from '@/lib/firebase';

/**
 * Track deployment usage for a project
 *
 * @param projectId The project ID to track usage for
 * @param buildDurationMs The duration of the build in milliseconds
 */
export async function trackDeployment(projectId: string, buildDurationMs: number): Promise<void> {
    const db = getDb();
    const buildMinutes = Math.ceil(buildDurationMs / 60000);

    // Update the usage document for the project
    // Using atomic increments to ensure accuracy
    await db.collection(Collections.USAGE).doc(projectId).set(
        {
            id: projectId,
            totalDeployments: FieldValue.increment(1),
            totalBuildMinutes: FieldValue.increment(buildMinutes),
            lastUpdated: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}
