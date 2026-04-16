import { NextRequest, NextResponse } from 'next/server';
import { getDb, Collections } from '@/lib/firebase';
import { getCloudSqlHistoricalMetrics, getScalingRecommendations } from '@/lib/gcp/monitoring';
import { updateInstanceSettings } from '@/lib/gcp/cloudsql';
import { logAuditEvent } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';
import type { Project, StorageConfig } from '@/types';

/**
 * Cron job to analyze resource utilization and apply auto-scaling recommendations.
 * This should be triggered periodically (e.g., via GitHub Actions or Cloud Scheduler).
 */
export async function GET(request: NextRequest) {
    // Basic auth check for cron triggers (using a secret token)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        // Enforce strict security in production, allow bypass only in local dev with MOCK_DB
        if (process.env.NODE_ENV === 'production' || process.env.MOCK_DB !== 'true') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: securityHeaders });
        }
    }

    try {
        const db = getDb();
        const projectsSnapshot = await db.collection(Collections.PROJECTS).get();
        const results = [];

        for (const projectDoc of projectsSnapshot.docs) {
            const project = projectDoc.data() as Project;
            const storageConfigs = project.storageConfigs || [];

            for (const storage of storageConfigs) {
                // Only process Cloud SQL with auto-scaling enabled
                if (storage.type.includes('cloud-sql') && storage.autoScalingSettings?.enabled) {
                    const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');

                    // Fetch historical metrics (7 days)
                    const historicalMetrics = await getCloudSqlHistoricalMetrics(resourceName, 7);

                    if (historicalMetrics.length === 0) continue;

                    // Calculate averages
                    const count = historicalMetrics.length;
                    const avgMetrics = historicalMetrics.reduce((acc, curr) => ({
                        cpuUtilization: acc.cpuUtilization + curr.cpuUtilization,
                        memoryUtilization: acc.memoryUtilization + curr.memoryUtilization,
                        diskUtilization: (acc.diskUtilization || 0) + (curr.diskUtilization || 0),
                        timestamp: curr.timestamp
                    }), { cpuUtilization: 0, memoryUtilization: 0, diskUtilization: 0, timestamp: '' });

                    const metrics = {
                        cpuUtilization: avgMetrics.cpuUtilization / count,
                        memoryUtilization: avgMetrics.memoryUtilization / count,
                        diskUtilization: (avgMetrics.diskUtilization || 0) / count,
                        timestamp: new Date().toISOString()
                    };

                    // Get recommendations
                    const recommendations = await getScalingRecommendations(
                        storage.type,
                        metrics,
                        {
                            tier: storage.metadata?.tier,
                            diskSizeGb: storage.metadata?.diskSizeGb
                        }
                    );

                    // Apply the first actionable recommendation (Auto-Pilot)
                    const autoScalingRec = recommendations.find(r => r.type === 'upgrade' || r.type === 'downgrade');

                    if (autoScalingRec) {
                        console.log(`[Auto-Pilot] Applying ${autoScalingRec.type} to ${resourceName}: ${autoScalingRec.currentTier} -> ${autoScalingRec.recommendedTier}`);

                        try {
                            await updateInstanceSettings(resourceName, {
                                tier: autoScalingRec.recommendedTier
                            });

                            // Log the action
                            await logAuditEvent(
                                project.teamId || null,
                                project.userId,
                                'storage.autoscaled',
                                {
                                    projectId: project.id,
                                    storageId: storage.id,
                                    resourceName,
                                    action: autoScalingRec.type,
                                    oldTier: autoScalingRec.currentTier,
                                    newTier: autoScalingRec.recommendedTier,
                                    reason: autoScalingRec.reason
                                }
                            );

                            results.push({
                                project: project.name,
                                storage: storage.name,
                                action: autoScalingRec.type,
                                tier: autoScalingRec.recommendedTier
                            });
                        } catch (err) {
                            console.error(`[Auto-Pilot] Failed to scale ${resourceName}:`, err);
                        }
                    }
                }
            }
        }

        return NextResponse.json({ success: true, actionsTaken: results }, { headers: securityHeaders });
    } catch (error) {
        console.error('Auto-Pilot cron failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: securityHeaders });
    }
}
