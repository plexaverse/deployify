import { FieldValue } from 'firebase-admin/firestore';
import { getDb, Collections } from '@/lib/firebase';
import { listProjectsByUser, listDeploymentsByProject, getUserById, updateUser } from '@/lib/db';
import type { User } from '@/types';
import { getTierLimits, SubscriptionTier } from './tiers';
import { sendEmail } from '@/lib/email/client';
import { usageAlertEmail } from '@/lib/email/templates';
import { getBandwidthUsage } from '@/lib/gcp/metrics';
import { getProductionServiceName } from '@/lib/gcp/cloudrun';

export interface Usage {
    deployments: number;
    buildMinutes: number;
    bandwidth: number; // in bytes
}

/**
 * Track deployment usage for a project (atomic increments)
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

/**
 * Get monthly usage with direct Firestore queries (more accurate)
 */
export async function getMonthlyUsage(userId: string) {
    const db = getDb();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get user's projects to filter deployments
    const projectsSnapshot = await db.collection(Collections.PROJECTS)
        .where('userId', '==', userId)
        .get();

    if (projectsSnapshot.empty) {
        return { deployments: 0, buildMinutes: 0, bandwidth: 0 };
    }

    const projectIds = projectsSnapshot.docs.map(doc => doc.id);

    let totalDeployments = 0;
    let totalBuildDurationMs = 0;

    const deploymentPromises = projectIds.map(projectId =>
        db.collection(Collections.DEPLOYMENTS)
            .where('projectId', '==', projectId)
            .where('createdAt', '>=', startOfMonth)
            .where('createdAt', '<=', endOfMonth)
            .get()
    );

    const snapshots = await Promise.all(deploymentPromises);

    snapshots.forEach(snap => {
        totalDeployments += snap.size;
        snap.docs.forEach(doc => {
            const data = doc.data();
            if (data.buildDurationMs) {
                totalBuildDurationMs += data.buildDurationMs;
            }
        });
    });

    const buildMinutes = Math.ceil(totalBuildDurationMs / 1000 / 60);
    const bandwidth = 0; // Placeholder

    return {
        deployments: totalDeployments,
        buildMinutes,
        bandwidth
    };
}

/**
 * Track usage and send alerts if nearing limits
 */
export async function trackUsageAndAlert(userId: string): Promise<void> {
    try {
        // 1. Calculate usage
        const usage = await getMonthlyUsage(userId);

        // 2. Get user tier
        const user = await getUserById(userId);
        if (!user) return;

        // Default to free tier if not specified
        const tier: SubscriptionTier = user.subscription?.tier || 'free';
        const limits = getTierLimits(tier);

        // 3. Check limits and alert
        await checkAndAlert(user, 'deployments', usage.deployments, limits.deployments);
        await checkAndAlert(user, 'buildMinutes', usage.buildMinutes, limits.buildMinutes);
    } catch (error) {
        console.error('Error tracking deployment usage:', error);
    }
}

async function checkAndAlert(user: User, metric: string, usage: number, limit: number) {
    if (limit === 0 || limit === Infinity) return; // Unlimited

    const percentage = (usage / limit) * 100;

    // Check if usage is above 80%
    if (percentage >= 80) {
        // Spam prevention: Check if we already sent an alert for this metric this month
        const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2023-10"
        const alertKey = `${currentMonth}-${metric}-80`;

        if (user.lastUsageAlertKey === alertKey) {
            console.log(`Alert already sent for ${alertKey}. Skipping.`);
            return;
        }

        console.log(`Alerting user ${user.email} for ${metric} usage: ${percentage.toFixed(1)}%`);

        if (user.email) {
            const { subject, html } = usageAlertEmail(
                user.name || 'User',
                metric,
                usage,
                limit
            );

            await sendEmail({
                to: user.email,
                subject,
                html
            });

            // Update user to prevent duplicate alerts
            try {
                await updateUser(user.id, {
                    lastUsageAlertKey: alertKey
                });
            } catch (error) {
                console.error('Failed to update user alert status:', error);
            }
        }
    }
}
