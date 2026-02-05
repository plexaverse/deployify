import { FieldValue } from 'firebase-admin/firestore';
import { getDb, Collections } from '@/lib/firebase';
import { listProjectsByUser, listDeploymentsByProject } from '@/lib/db';

export interface Usage {
    deployments: number;
    buildMinutes: number;
    bandwidth: number; // in bytes
}

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

/**
 * Get current usage statistics for a user
 * 
 * @param userId The user ID to get usage for
 * @returns Usage statistics for the current billing period
 */
export async function getUsage(userId: string): Promise<Usage> {
    try {
        const projects = await listProjectsByUser(userId);
        let deploymentCount = 0;
        let totalBuildMs = 0;

        // Determine start of current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Fetch deployments (fetching more to ensure we cover the month)
        // Note: In a real implementation, we should query with a date filter directly in the DB
        // to avoid fetching unnecessary records.
        const deploymentPromises = projects.map(project =>
            listDeploymentsByProject(project.id, 100)
        );

        const results = await Promise.all(deploymentPromises);
        const allDeployments = results.flat();

        allDeployments.forEach(deploy => {
            // Filter by date
            if (deploy.createdAt >= startOfMonth) {
                deploymentCount++;
                if (deploy.buildDurationMs) {
                    totalBuildMs += deploy.buildDurationMs;
                }
            }
        });

        return {
            deployments: deploymentCount,
            buildMinutes: Math.ceil(totalBuildMs / 1000 / 60),
            bandwidth: 0
        };
    } catch (error) {
        console.error('Error fetching usage:', error);
        return {
            deployments: 0,
            buildMinutes: 0,
            bandwidth: 0
        };
    }
}
