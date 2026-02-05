import { FieldValue } from 'firebase-admin/firestore';
import { getDb, Collections } from '@/lib/firebase';
import { listProjectsByUser, listDeploymentsByProject } from '@/lib/db';
import { getBandwidthUsage } from '@/lib/gcp/metrics';
import { getProductionServiceName } from '@/lib/gcp/cloudrun';

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
        let totalBandwidth = 0;

        // Determine start of current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Fetch deployments and bandwidth in parallel
        const deploymentPromises = projects.map(project =>
            listDeploymentsByProject(project.id, 100)
        );

        const bandwidthPromises = projects.map(async (project) => {
            try {
                const serviceName = getProductionServiceName(project.slug);
                return await getBandwidthUsage(serviceName, project.region, { startTime: startOfMonth });
            } catch (error) {
                // If service doesn't exist or other error, assume 0 bandwidth
                console.warn(`Failed to fetch bandwidth for project ${project.slug}:`, error);
                return 0;
            }
        });

        const [deploymentResults, bandwidthResults] = await Promise.all([
            Promise.all(deploymentPromises),
            Promise.all(bandwidthPromises)
        ]);

        const allDeployments = deploymentResults.flat();

        allDeployments.forEach(deploy => {
            // Filter by date
            if (deploy.createdAt >= startOfMonth) {
                deploymentCount++;
                if (deploy.buildDurationMs) {
                    totalBuildMs += deploy.buildDurationMs;
                }
            }
        });

        totalBandwidth = bandwidthResults.reduce((acc, curr) => acc + curr, 0);

        return {
            deployments: deploymentCount,
            buildMinutes: Math.ceil(totalBuildMs / 1000 / 60),
            bandwidth: totalBandwidth
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
