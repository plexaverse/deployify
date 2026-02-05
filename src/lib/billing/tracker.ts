import { FieldValue } from 'firebase-admin/firestore';
import { getDb, Collections } from '../firebase';

/**
 * Track deployment usage for a project
 *
 * @param projectId The project ID to track usage for
 * @param buildDurationMs The duration of the build in milliseconds
 */
export async function trackDeployment(projectId: string, buildDurationMs: number): Promise<void> {
    const db = getDb();
    const minutes = buildDurationMs / 1000 / 60;

    await db.collection(Collections.USAGE).doc(projectId).set(
        {
            id: projectId,
            totalDeployments: FieldValue.increment(1),
            totalBuildMinutes: FieldValue.increment(minutes),
            lastUpdated: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}
