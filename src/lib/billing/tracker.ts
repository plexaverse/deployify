import { getDb, Collections } from '@/lib/firebase';
import { getTierLimits, SubscriptionTier } from './tiers';
import { sendEmail } from '@/lib/email/client';
import { usageAlertEmail } from '@/lib/email/templates';
import { getUserById, updateUser } from '@/lib/db';

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

    // Firestore 'in' query supports max 10 values.
    // We'll batch requests or use Promise.all for individual project queries.
    // Using Promise.all with chunking would be better if many projects,
    // but assuming reasonable number for now.

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

    // Round build minutes up (Cloud Build billing is per minute usually, or partial)
    // Memory says: "Deployment build minutes are calculated by rounding the build duration... up to the nearest minute."
    const buildMinutes = Math.ceil(totalBuildDurationMs / 1000 / 60);

    // Bandwidth - placeholder as we don't have metrics yet
    const bandwidth = 0;

    return {
        deployments: totalDeployments,
        buildMinutes,
        bandwidth
    };
}

export async function trackDeployment(userId: string) {
    try {
        // 1. Calculate usage
        const usage = await getMonthlyUsage(userId);

        // 2. Get user tier
        const user = await getUserById(userId);
        if (!user) return;

        // Default to free tier if not specified
        const tier: SubscriptionTier = (user as any).subscription?.tier || 'free';
        const limits = getTierLimits(tier);

        // 3. Check limits and alert
        await checkAndAlert(user, 'deployments', usage.deployments, limits.deployments);
        await checkAndAlert(user, 'buildMinutes', usage.buildMinutes, limits.buildMinutes);
    } catch (error) {
        console.error('Error tracking deployment usage:', error);
    }
}

async function checkAndAlert(user: any, metric: string, usage: number, limit: number) {
    if (limit === 0) return; // Unlimited or invalid

    const percentage = (usage / limit) * 100;

    // Check if usage is above 80%
    if (percentage >= 80) {
        // Spam prevention: Check if we already sent an alert for this metric this month
        const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2023-10"
        const alertKey = `${currentMonth}-${metric}-80`;

        // Check loosely against stored key (assumes we store this on the user record)
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
                // Cast to any to allow dynamic property that isn't in User interface yet
                await updateUser(user.id, {
                    lastUsageAlertKey: alertKey
                } as any);
            } catch (error) {
                console.error('Failed to update user alert status:', error);
            }
        }
    }
}
