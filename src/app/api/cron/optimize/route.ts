import { NextRequest, NextResponse } from 'next/server';
import { getDb, Collections } from '@/lib/firebase';
import { getCloudSqlHistoricalMetrics, getMemorystoreHistoricalMetrics, getScalingRecommendations, ResourceMetrics } from '@/lib/gcp/monitoring';
import { updateInstanceSettings as updateSqlSettings } from '@/lib/gcp/cloudsql';
import { updateInstanceSettings as updateRedisSettings } from '@/lib/gcp/memorystore';
import { logAuditEvent } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';
import type { Project } from '@/types';

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
                // Only process connectors with auto-scaling enabled
                if (!storage.autoScalingSettings?.enabled) continue;

                const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                const region = (storage.metadata?.region as string) || project.region || 'us-central1';

                let historicalMetrics: ResourceMetrics[] = [];

                if (storage.type.includes('cloud-sql')) {
                    historicalMetrics = await getCloudSqlHistoricalMetrics(resourceName, 7);
                } else if (storage.type === 'memorystore-redis') {
                    historicalMetrics = await getMemorystoreHistoricalMetrics(resourceName, region, 7);
                }

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
                        tier: storage.metadata?.tier || storage.metadata?.memorySizeGb?.toString(),
                        diskSizeGb: storage.metadata?.diskSizeGb,
                        memorySizeGb: storage.metadata?.memorySizeGb
                    }
                );

                // Apply the first actionable recommendation (Auto-Pilot)
                const autoScalingRec = recommendations.find(r => r.type === 'upgrade' || r.type === 'downgrade');

                if (autoScalingRec) {
                    console.log(`[Auto-Pilot] Applying ${autoScalingRec.type} to ${resourceName} (${storage.type}): ${autoScalingRec.currentTier} -> ${autoScalingRec.recommendedTier}`);

                    try {
                        if (storage.type.includes('cloud-sql')) {
                            await updateSqlSettings(resourceName, {
                                tier: autoScalingRec.recommendedTier
                            });
                        } else if (storage.type === 'memorystore-redis') {
                            await updateRedisSettings(resourceName, region, {
                                memorySizeGb: parseInt(autoScalingRec.recommendedTier)
                            });
                        }

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
                            type: storage.type,
                            action: autoScalingRec.type,
                            tier: autoScalingRec.recommendedTier
                        });
                    } catch (err) {
                        console.error(`[Auto-Pilot] Failed to scale ${resourceName}:`, err);
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
