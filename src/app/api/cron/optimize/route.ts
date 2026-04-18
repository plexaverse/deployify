import { NextRequest, NextResponse } from 'next/server';
import { getDb, Collections } from '@/lib/firebase';
import { getCloudSqlHistoricalMetrics, getMemorystoreHistoricalMetrics, getScalingRecommendations, getExternalMetrics } from '@/lib/gcp/monitoring';
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
                // Process Cloud SQL, Memorystore and Neon with auto-scaling enabled
                const isSql = storage.type.includes('cloud-sql');
                const isRedis = storage.type === 'memorystore-redis';
                const isNeon = storage.type === 'neon';

                if ((isSql || isRedis || isNeon) && storage.autoScalingSettings?.enabled) {
                    const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    const region = (storage.metadata?.region as string) || project.region || 'us-central1';

                    let metrics;

                    if (isSql || isRedis) {
                        // Fetch historical metrics (7 days)
                        const historicalMetrics = isSql
                            ? await getCloudSqlHistoricalMetrics(resourceName, 7)
                            : await getMemorystoreHistoricalMetrics(resourceName, region, 7);

                        if (historicalMetrics.length === 0) continue;

                        // Calculate averages
                        const count = historicalMetrics.length;
                        const avgMetrics = historicalMetrics.reduce((acc, curr) => ({
                            cpuUtilization: acc.cpuUtilization + curr.cpuUtilization,
                            memoryUtilization: acc.memoryUtilization + curr.memoryUtilization,
                            diskUtilization: (acc.diskUtilization || 0) + (curr.diskUtilization || 0),
                            timestamp: curr.timestamp
                        }), { cpuUtilization: 0, memoryUtilization: 0, diskUtilization: 0, timestamp: '' });

                        metrics = {
                            cpuUtilization: avgMetrics.cpuUtilization / count,
                            memoryUtilization: avgMetrics.memoryUtilization / count,
                            diskUtilization: (avgMetrics.diskUtilization || 0) / count,
                            timestamp: new Date().toISOString()
                        };
                    } else if (isNeon) {
                        // Fetch current usage for Neon (Management API)
                        const ext = await getExternalMetrics(storage.type, storage.metadata || {});
                        metrics = {
                            cpuUtilization: ext.usage || 0,
                            memoryUtilization: 0,
                            timestamp: new Date().toISOString()
                        };
                    }

                    if (!metrics) continue;

                    // Get recommendations
                    const recommendations = await getScalingRecommendations(
                        storage.type,
                        metrics,
                        {
                            tier: storage.metadata?.tier || (isRedis ? `${storage.metadata?.memorySizeGb}GB` : undefined),
                            diskSizeGb: storage.metadata?.diskSizeGb
                        }
                    );

                    // Apply the first actionable recommendation (Auto-Pilot)
                    const autoScalingRec = recommendations.find(r => r.type === 'upgrade' || r.type === 'downgrade');

                    if (autoScalingRec) {
                        console.log(`[Auto-Pilot] Applying ${autoScalingRec.type} to ${resourceName} (${storage.type}): ${autoScalingRec.currentTier} -> ${autoScalingRec.recommendedTier}`);

                        try {
                            if (isSql) {
                                await updateSqlSettings(resourceName, {
                                    tier: autoScalingRec.recommendedTier
                                });
                            } else if (isRedis) {
                                await updateRedisSettings(resourceName, region, {
                                    memorySizeGb: parseInt(autoScalingRec.recommendedTier)
                                });
                            } else if (isNeon) {
                                // For Neon, Auto-Pilot updates the discovered tier metadata
                                // which will be synced to the provider during the next heartbeat.
                                // In a real production scenario, we would call the Neon API here.
                                const providerApiKey = storage.metadata?.providerApiKey as string;
                                const neonProjectId = storage.metadata?.neonProjectId as string;

                                if (providerApiKey && neonProjectId && process.env.MOCK_DB !== 'true') {
                                    await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}`, {
                                        method: 'PATCH',
                                        headers: {
                                            'Authorization': `Bearer ${providerApiKey}`,
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                            project: {
                                                plan_id: autoScalingRec.recommendedTier.toLowerCase()
                                            }
                                        })
                                    });
                                }
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
