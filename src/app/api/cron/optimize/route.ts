import { NextRequest, NextResponse } from 'next/server';
import { getDb, Collections } from '@/lib/firebase';
import { getCloudSqlHistoricalMetrics, getMemorystoreHistoricalMetrics, getScalingRecommendations, getExternalMetrics, getMaintenanceRecommendation } from '@/lib/gcp/monitoring';
import { updateInstanceSettings as updateSqlSettings, updateMaintenanceWindow } from '@/lib/gcp/cloudsql';
import { updateInstanceSettings as updateRedisSettings } from '@/lib/gcp/memorystore';
import { logAuditEvent } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';
import type { Project } from '@/types';

/**
 * Helper to get numeric order of tiers for comparison
 */
function getTierOrder(tier: string, type: string): number {
    if (type.includes('cloud-sql')) {
        const order = [
            'db-f1-micro',
            'db-g1-small',
            'db-custom-1-3840',
            'db-custom-2-7680',
            'db-n1-standard-1',
            'db-custom-4-15360',
            'db-n1-standard-2',
            'db-n1-highmem-2',
            'db-custom-8-30720',
            'db-n1-standard-4',
            'db-n1-highmem-4'
        ];
        return order.indexOf(tier);
    }
    if (type === 'neon') {
        const order = ['FREE', 'LAUNCH', 'PRO', 'SCALE'];
        return order.indexOf(tier.toUpperCase());
    }
    if (type === 'memorystore-redis') {
        return parseInt(tier) || 0;
    }
    return -1;
}

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
            const storageConfigs = [...(project.storageConfigs || [])];
            let projectUpdated = false;

            for (let i = 0; i < storageConfigs.length; i++) {
                const storage = storageConfigs[i];
                // Process Cloud SQL, Memorystore and Neon with auto-scaling enabled
                const isSql = storage.type.includes('cloud-sql');
                const isRedis = storage.type === 'memorystore-redis';
                const isNeon = storage.type === 'neon';

                if ((isSql || isRedis || isNeon) && storage.autoScalingSettings?.enabled) {
                    const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    const region = (storage.metadata?.region as string) || project.region || 'us-central1';

                    let metrics;
                    let historicalMetrics;

                    if (isSql || isRedis) {
                        // Fetch historical metrics (7 days)
                        historicalMetrics = isSql
                            ? await getCloudSqlHistoricalMetrics(resourceName, 7)
                            : await getMemorystoreHistoricalMetrics(resourceName, region, 7);

                        if (!historicalMetrics || historicalMetrics.length === 0) continue;

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
                        const ext = await getExternalMetrics(storage.type, storage.metadata || {}, storage.providerApiKeySecretId);
                        metrics = {
                            cpuUtilization: ext.usage || 0,
                            memoryUtilization: 0,
                            timestamp: new Date().toISOString()
                        };
                    }

                    if (!metrics) continue;

                    // Phase 118: Generate Maintenance Recommendation for Cloud SQL
                    if (isSql && historicalMetrics) {
                        const maintenanceRec = getMaintenanceRecommendation(historicalMetrics);
                        if (maintenanceRec) {
                            storage.metadata = {
                                ...storage.metadata,
                                maintenanceRecommendation: maintenanceRec
                            };
                            projectUpdated = true;
                        }
                    }

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

                    // Phase 118: Autonomous Maintenance Window Alignment
                    if (isSql && storage.autoMaintenanceWindow) {
                        const rec = storage.metadata?.maintenanceRecommendation as { day: number; hour: number } | undefined;
                        const isSynced = !!storage.metadata?.maintenanceWindowSynced;

                        if (rec && !isSynced) {
                            console.log(`[Auto-Pilot] Aligning maintenance window for ${resourceName}: Day ${rec.day}, Hour ${rec.hour}`);
                            try {
                                await updateMaintenanceWindow(resourceName, rec.day, rec.hour);
                                storage.metadata = {
                                    ...storage.metadata,
                                    maintenanceWindowSynced: true,
                                    lastMaintenanceSyncAt: new Date().toISOString()
                                };
                                projectUpdated = true;

                                await logAuditEvent(
                                    project.teamId || null,
                                    project.userId,
                                    'storage.maintenance_aligned',
                                    {
                                        projectId: project.id,
                                        storageId: storage.id,
                                        resourceName,
                                        day: rec.day,
                                        hour: rec.hour
                                    }
                                );
                            } catch (maintErr) {
                                console.error(`[Auto-Pilot] Failed to align maintenance window for ${resourceName}:`, maintErr);
                            }
                        }
                    }

                    if (autoScalingRec) {
                        // Phase 113: Respect Min/Max Tier Boundaries
                        const targetTier = autoScalingRec.recommendedTier;
                        const minTier = storage.autoScalingSettings?.minTier;
                        const maxTier = storage.autoScalingSettings?.maxTier;

                        if (minTier) {
                            const targetOrder = getTierOrder(targetTier, storage.type);
                            const minOrder = getTierOrder(minTier, storage.type);
                            if (targetOrder !== -1 && minOrder !== -1 && targetOrder < minOrder) {
                                console.log(`[Auto-Pilot] Skipping ${autoScalingRec.type} for ${resourceName}: Target ${targetTier} is below minTier ${minTier}`);
                                continue;
                            }
                        }

                        if (maxTier) {
                            const targetOrder = getTierOrder(targetTier, storage.type);
                            const maxOrder = getTierOrder(maxTier, storage.type);
                            if (targetOrder !== -1 && maxOrder !== -1 && targetOrder > maxOrder) {
                                console.log(`[Auto-Pilot] Skipping ${autoScalingRec.type} for ${resourceName}: Target ${targetTier} is above maxTier ${maxTier}`);
                                continue;
                            }
                        }

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
                                let providerApiKey = storage.metadata?.providerApiKey as string;
                                if (!providerApiKey && storage.providerApiKeySecretId) {
                                    const { getSecretValue } = await import('@/lib/gcp/secrets');
                                    providerApiKey = await getSecretValue(storage.providerApiKeySecretId);
                                }
                                const neonProjectId = storage.metadata?.neonProjectId as string;

                                if (providerApiKey && neonProjectId && process.env.MOCK_DB !== 'true') {
                                    const neonRes = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}`, {
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
                                    if (!neonRes.ok) {
                                        console.error(`[Auto-Pilot] Neon API scaling failed for ${resourceName}: ${await neonRes.text()}`);
                                        continue;
                                    }
                                }
                            }

                            // Update the local storage config metadata to reflect the new tier
                            storageConfigs[i] = {
                                ...storage,
                                metadata: {
                                    ...storage.metadata,
                                    tier: autoScalingRec.recommendedTier
                                },
                                updatedAt: new Date()
                            };
                            projectUpdated = true;

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

            if (projectUpdated) {
                await db.collection(Collections.PROJECTS).doc(project.id).update({
                    storageConfigs,
                    updatedAt: new Date()
                });
            }
        }

        return NextResponse.json({ success: true, actionsTaken: results }, { headers: securityHeaders });
    } catch (error) {
        console.error('Auto-Pilot cron failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: securityHeaders });
    }
}
