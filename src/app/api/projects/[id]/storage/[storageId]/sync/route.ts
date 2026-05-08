import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { getOperationStatus as getCloudSqlOperationStatus, getInstance as getCloudSqlInstance, createUser as createCloudSqlUser } from '@/lib/gcp/cloudsql';
import { getOperationStatus as getMemorystoreOperationStatus, getInstance as getMemorystoreInstance } from '@/lib/gcp/memorystore';
import { getOperationStatus as getFirestoreOperationStatus } from '@/lib/gcp/firestore-admin';
import { getGcpProjectNumber } from '@/lib/gcp/auth';
import { checkConnectivityHealth } from '@/lib/gcp/storage-validator';
import { calculateEWMA, isDegraded as detectDegradation, forecastLatency } from '@/lib/gcp/health-utils';
import type { StorageConfig } from '@/types';
import { logAuditEvent } from '@/lib/audit';
import { getCloudSqlMetrics, getMemorystoreMetrics, checkAlertThresholds, getScalingRecommendations, getResourceDormancy, detectWorkloadProfile, detectColdStart, detectWorkloadShift, getCloudSqlHistoricalMetrics, getMaintenanceRecommendation, detectConnectionLeaks, calculateReliabilityScore, checkSLOViolations, discoverSensitiveData } from '@/lib/gcp/monitoring';
import { syncResourceLabels } from '@/lib/gcp/labeling';
import { sendEmail } from '@/lib/email/client';
import { storageAlertEmail } from '@/lib/email/templates';
import { getUserById } from '@/lib/db';

/**
 * Sync storage provisioning status from GCP and check monitoring alerts
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];

        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];
        const now = new Date();

        // 0. Perform automated health heartbeat for active connectors
        if (storage.status === 'active' || storage.status === 'error') {
            try {
                // 0a. Connectivity Drift Detection & Reconciliation (Phase 112)
                if (storage.connectionStringSecretId && storage.type !== 'firestore') {
                    try {
                        const { getSecretValue } = await import('@/lib/gcp/secrets');
                        const connectionString = await getSecretValue(storage.connectionStringSecretId);
                        let actualHost = '';
                        let actualPort = 0;

                        if (connectionString.startsWith('mongodb+srv://')) {
                            actualHost = new URL(connectionString).hostname;
                            actualPort = 27017;
                        } else if (!connectionString.includes('enable_iam_auth=true')) {
                            try {
                                const url = new URL(connectionString);
                                actualHost = url.hostname;
                                actualPort = url.port ? parseInt(url.port, 10) : (
                                    storage.type.includes('postgres') || storage.type === 'supabase' ? 5432 :
                                    storage.type.includes('mysql') || storage.type === 'planetscale' ? 3306 :
                                    storage.type === 'memorystore-redis' ? 6379 :
                                    storage.type === 'mongodb-atlas' ? 27017 : 0
                                );
                            } catch { /* Invalid URL */ }
                        }

                        if (actualHost && actualHost !== 'localhost') {
                            const currentConnectivity = storage.metadata?.connectivity as { host: string; port: number } | undefined;

                            // Reconciliation: If metadata is missing OR differs from actual secret state
                            if (!currentConnectivity || currentConnectivity.host !== actualHost || currentConnectivity.port !== actualPort) {
                                console.log(`[Reconciliation] Drift detected for ${storageId}. Reconciling metadata with Secret Manager state.`);

                                storage.metadata = {
                                    ...storage.metadata,
                                    connectivity: { host: actualHost, port: actualPort }
                                };

                                await logAuditEvent(
                                    project.teamId || null,
                                    session.user.id,
                                    'storage.reconcile_drift',
                                    {
                                        projectId: id,
                                        storageId,
                                        storageName: storage.name,
                                        previous: currentConnectivity,
                                        updated: { host: actualHost, port: actualPort }
                                    }
                                );
                            }
                        }
                    } catch (driftErr) {
                        console.error(`[DriftDetection] Failed for ${storageId}:`, driftErr);
                    }
                }

                const health = await checkConnectivityHealth(storage.type, storage.connectionStringSecretId, storage.metadata);

                // Phase 135: Predictive Connectivity Resilience
                const currentHealth = storage.metadata?.health as { baselineLatency?: number, history?: number[] } | undefined;
                const newBaseline = calculateEWMA(health.latency, currentHealth?.baselineLatency);

                // Maintain small rolling history for forecasting
                const history = [...(currentHealth?.history || []), health.latency].slice(-10);
                const { predicted, jitter } = forecastLatency(history);
                const isPredictiveDegraded = predicted > (newBaseline * 1.5) || jitter > 0.5;

                // Detect degradation
                const isDegraded = detectDegradation(health.latency, newBaseline);
                const finalStatus = health.status === 'unhealthy' ? 'unhealthy' : (isDegraded ? 'degraded' : (isPredictiveDegraded ? 'degraded' : 'healthy'));

                // Phase 101: Detect Cold-Starts for serverless connectors
                const isColdStart = detectColdStart(health.latency, storage.type);

                storage.metadata = {
                    ...storage.metadata,
                    health: {
                        status: finalStatus,
                        latency: health.latency,
                        baselineLatency: parseFloat(newBaseline.toFixed(2)),
                        predictedLatency: parseFloat(predicted.toFixed(2)),
                        jitterScore: parseFloat(jitter.toFixed(3)),
                        isDegraded,
                        isPredictiveDegraded,
                        isColdStart,
                        history,
                        timestamp: health.timestamp,
                        error: health.error
                    }
                };

                // Auto-remediation: Transition from active to error if health check fails
                if (finalStatus === 'unhealthy' && storage.status === 'active') {
                    storage.status = 'error';
                    storage.lastError = health.error || 'Health check heartbeat failed';
                } else if ((finalStatus === 'healthy' || finalStatus === 'degraded') && storage.status === 'error') {
                    storage.status = 'active';
                    storage.lastError = undefined;
                }

                // 0b. Security Posture Audit
                try {
                    const { checkSecurityPosture } = await import('@/lib/gcp/security-auditor');
                    const posture = checkSecurityPosture(storage, project.region);
                    storage.metadata = {
                        ...storage.metadata,
                        security: posture
                    };
                } catch (secErr) {
                    console.error(`[SecurityAudit] Failed for ${storageId}:`, secErr);
                }

                // 0c. Phase 107: Regional Auto-Alignment
                if (storage.autoAlign && storage.metadata?.provisioned && storage.type.includes('cloud-sql') && storage.status === 'active') {
                    const configRegion = (storage.metadata?.region as string) || storage.region;
                    const projectRegion = project.region;

                    if (configRegion && projectRegion && configRegion !== projectRegion) {
                        try {
                            const { migrateInstanceToRegion } = await import('@/lib/gcp/cloudsql');
                            const resourceName = (storage.metadata?.resourceName as string);

                            if (resourceName) {
                                console.log(`[AutoAlign] Triggering regional migration for ${storageId} from ${configRegion} to ${projectRegion}`);
                                const { operationName, targetInstanceName } = await migrateInstanceToRegion(resourceName, projectRegion);

                                storage.status = 'provisioning';
                                storage.metadata = {
                                    ...storage.metadata,
                                    operationName,
                                    lastOperation: 'migrate_region',
                                    targetInstanceName,
                                    targetRegion: projectRegion
                                };
                                // Immediately update state to avoid multiple triggers
                                storageConfigs[index] = storage;
                                await updateProject(id, { storageConfigs });
                            }
                        } catch (alignErr) {
                            console.error(`[AutoAlign] Failed for ${storageId}:`, alignErr);
                        }
                    }
                }

                // 0d. Phase 123/124: Zero-Trust IAM & Secret Governance
                if (storage.metadata?.provisioned && storage.status === 'active') {
                    try {
                        const { checkLeastPrivilege, checkBroadSecretAccess } = await import('@/lib/gcp/iam');
                        const gcpProjectId = (storage.metadata?.projectId as string) || project.id; // Fallback to id as projectId if not in metadata
                        const saName = process.env.GCP_SERVICE_ACCOUNT_NAME || 'deployify-sa';
                        const saEmail = `${saName}@${gcpProjectId}.iam.gserviceaccount.com`;

                        const [iamResult, hasBroadSecretAccess] = await Promise.all([
                            checkLeastPrivilege(gcpProjectId, saEmail),
                            checkBroadSecretAccess(gcpProjectId, saEmail)
                        ]);

                        storage.metadata = {
                            ...storage.metadata,
                            iamOverprivileged: iamResult.overprivileged,
                            excessiveRoles: iamResult.excessiveRoles,
                            broadSecretAccess: hasBroadSecretAccess
                        };
                    } catch (iamErr) {
                        console.error(`[ZeroTrustSync] IAM check failed for ${storageId}:`, iamErr);
                    }
                }

                // 0e. Phase 141: Intelligent Connection Leak Detection
                if (storage.status === 'active' && (storage.type.includes('cloud-sql') || storage.type === 'supabase' || storage.type === 'neon')) {
                    try {
                        const { getSecretValue } = await import('@/lib/gcp/secrets');
                        const { getActiveSessions } = await import('@/lib/gcp/cloudsql');

                        const connStr = storage.connectionStringSecretId ? await getSecretValue(storage.connectionStringSecretId) : '';
                        if (connStr) {
                            const dbType = (storage.type.includes('postgres') || storage.type === 'supabase' || storage.type === 'neon') ? 'postgres' : 'mysql';
                            const sessions = await getActiveSessions(connStr, dbType as 'postgres' | 'mysql', { ssl: !!storage.ssl });
                            const leakReport = detectConnectionLeaks(sessions);

                            storage.metadata = {
                                ...storage.metadata,
                                connectionLeak: leakReport.hasLeak ? leakReport : undefined
                            };
                        }
                    } catch (leakErr) {
                        console.error(`[ConnectionLeakSync] Check failed for ${storageId}:`, leakErr);
                    }
                }

                // 0g. Phase 143: Autonomous PII Discovery & Governance
                const complianceReport = storage.metadata?.complianceReport as import('@/types').ComplianceReport | undefined;
                const lastComplianceScan = complianceReport?.lastScannedAt ? new Date(complianceReport.lastScannedAt) : new Date(0);
                const hoursSinceComplianceScan = (now.getTime() - lastComplianceScan.getTime()) / (1000 * 60 * 60);

                if (storage.status === 'active' && hoursSinceComplianceScan >= 24) {
                    try {
                        const { getSecretValue } = await import('@/lib/gcp/secrets');
                        const connStr = storage.connectionStringSecretId ? await getSecretValue(storage.connectionStringSecretId) : '';
                        if (connStr || storage.type === 'firestore') {
                            const report = await discoverSensitiveData(storage, connStr);
                            storage.metadata = {
                                ...storage.metadata,
                                complianceReport: report
                            };
                        }
                    } catch (complianceErr) {
                        console.error(`[ComplianceSync] PII discovery failed for ${storageId}:`, complianceErr);
                    }
                }

                // 0f. Phase 101: Automated Resource Labeling
                if (storage.metadata?.provisioned && storage.labelingStatus !== 'SYNCED') {
                    try {
                        const labelResult = await syncResourceLabels(project, storage);
                        storage.labelingStatus = labelResult.success ? 'SYNCED' : 'FAILED';
                    } catch (labelErr) {
                        console.error(`[Labeling] Sync failed for ${storageId}:`, labelErr);
                        storage.labelingStatus = 'FAILED';
                    }
                }

                // Phase 108: Automated DR Failover logic
                if (finalStatus === 'unhealthy' && storage.failoverSettings?.enabled && storage.type.includes('cloud-sql')) {
                    const failoverMetadata = storage.metadata?.failover as { consecutiveFailures?: number } | undefined;
                    const consecutiveFailures = (failoverMetadata?.consecutiveFailures || 0) + 1;

                    if (consecutiveFailures >= (storage.failoverSettings.heartbeatThreshold || 3)) {
                        const replicas = (storage.metadata?.replicas as Array<{ id: string, name: string, region: string, status: string, health?: { status: string, latency: number } }>) || [];
                        const healthyReplicas = replicas.filter(r => (r.status === 'active' || r.status === 'DONE') && (!r.health || r.health.status !== 'unhealthy'));

                        if (healthyReplicas.length > 0 && storage.failoverSettings.autoPromote) {
                            try {
                                const { orchestrateFailover } = await import('@/lib/gcp/cloudsql');
                                const resourceName = storage.metadata?.resourceName as string;

                                console.log(`[Failover] Primary ${storageId} unhealthy for ${consecutiveFailures} cycles. Triggering failover...`);
                                const { operationName, promotedReplicaId, promotedReplicaName } = await orchestrateFailover(resourceName, healthyReplicas);

                                storage.status = 'provisioning';
                                storage.metadata = {
                                    ...storage.metadata,
                                    operationName,
                                    lastOperation: 'failover_promotion',
                                    promotedReplicaId,
                                    promotedReplicaName,
                                    failover: {
                                        triggeredAt: now.toISOString(),
                                        consecutiveFailures: 0
                                    }
                                };
                            } catch (failoverErr) {
                                console.error(`[Failover] Orchestration failed for ${storageId}:`, failoverErr);
                            }
                        }
                    } else {
                        storage.metadata = {
                            ...storage.metadata,
                            failover: {
                                ...failoverMetadata,
                                consecutiveFailures
                            }
                        };
                    }
                } else if (finalStatus === 'healthy' || finalStatus === 'degraded') {
                    // Reset failure counter if primary is healthy
                    storage.metadata = {
                        ...storage.metadata,
                        failover: {
                            ...(storage.metadata?.failover as { triggeredAt?: string, consecutiveFailures?: number }),
                            consecutiveFailures: 0
                        }
                    };
                }

                // Persist health heartbeat and baselined connectivity metadata
                storageConfigs[index] = storage;
                await updateProject(id, { storageConfigs });
            } catch (healthErr) {
                console.error(`[HealthHeartbeat] Failed for ${storageId}:`, healthErr);
            }
        }

        // 1. Check monitoring metrics, alerts & optimization for active provisioned connectors
        if (storage.status === 'active' && storage.metadata?.provisioned) {
            try {
                const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                const region = (storage.metadata?.region as string) || access.project?.region || 'us-central1';

                let metrics;
                if (storage.type.includes('cloud-sql')) {
                    const dbType = storage.type.includes('postgres') ? 'postgresql' : 'mysql';
                    const tier = (storage.metadata?.tier as string) || 'db-f1-micro';
                    metrics = await getCloudSqlMetrics(resourceName, dbType, tier);
                } else if (storage.type === 'memorystore-redis') {
                    metrics = await getMemorystoreMetrics(resourceName, region);
                }

                if (metrics) {
                    // A. Optimization Intelligence: Analyze for scaling recommendations
                    try {
                        const { calculateEfficiencyScore } = await import('@/lib/gcp/monitoring');

                        // Phase 136: Fetch recent runtime telemetry for application-aware scaling
                        let telemetry;
                        try {
                            const { getDb, Collections } = await import('@/lib/firebase');
                            const db = getDb();
                            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                            const telSnapshot = await db.collection(Collections.RUNTIME_TELEMETRY)
                                .where('projectId', '==', id)
                                .where('storageId', '==', storageId)
                                .where('timestamp', '>=', dayAgo)
                                .get();

                            if (!telSnapshot.empty) {
                                const latencies = telSnapshot.docs.map(doc => Number(doc.data().durationMs) || 0).sort((a, b) => a - b);
                                const p90 = latencies[Math.floor(latencies.length * 0.9)];
                                const p99 = latencies[Math.floor(latencies.length * 0.99)];
                                const errors = telSnapshot.docs.filter(doc => !doc.data().success).length;
                                telemetry = { p90, p99, errorRate: (errors / telSnapshot.docs.length) * 100 };
                            }
                        } catch (telErr) {
                            console.warn(`[StorageSync] Failed to fetch telemetry for optimization:`, telErr);
                        }

                        const recommendations = await getScalingRecommendations(storage.type, metrics, storage.metadata, telemetry);

                        // Calculate Efficiency Score
                        const tier = (storage.metadata?.tier as string) || (storage.type.includes('cloud-sql') ? 'db-f1-micro' : (storage.type === 'memorystore-redis' ? '1GB' : ''));
                        const diskSizeGb = (storage.metadata?.diskSizeGb as number) || (storage.metadata?.memorySizeGb as number);
                        const isHA = !!storage.metadata?.highAvailability;
                        const { getEstimatedMonthlyCost } = await import('@/lib/gcp/monitoring');
                        const monthlyCost = getEstimatedMonthlyCost(storage.type, tier, diskSizeGb, isHA);
                        const efficiencyScore = calculateEfficiencyScore(metrics, monthlyCost);

                        storage.metadata = {
                            ...storage.metadata,
                            efficiencyScore,
                            optimization: recommendations.length > 0 ? {
                                recommendations,
                                lastAnalyzedAt: now.toISOString()
                            } : undefined
                        };
                    } catch (optErr) {
                        console.error(`[OptimizationInsight] Analysis failed for ${storageId}:`, optErr);
                    }

                    // B. Dormancy Analysis: Check for long-term inactivity
                    try {
                        const dormancy = await getResourceDormancy(storage.type, resourceName, region);
                        storage.dormancy = dormancy;

                        // Phase 101: Intelligent Workload Profiling
                        const previousProfile = storage.workloadProfile;
                        storage.workloadProfile = detectWorkloadProfile(metrics, dormancy);
                        storage.connectionSaturation = metrics.connectionSaturation;

                        // Phase 118: Maintenance Window Governance
                        if (storage.type.includes('cloud-sql')) {
                            try {
                                const historical = await getCloudSqlHistoricalMetrics(resourceName, 7);
                                const maintenanceRec = getMaintenanceRecommendation(historical, dormancy);
                                if (maintenanceRec) {
                                    storage.metadata = {
                                        ...storage.metadata,
                                        maintenanceRecommendation: maintenanceRec
                                    };
                                }
                            } catch (maintErr) {
                                console.error(`[MaintenanceInsight] Failed for ${storageId}:`, maintErr);
                            }
                        }

                        // Phase 142: Reliability & SLO Analysis
                        try {
                            const { getHealthHistory } = await import('@/lib/gcp/storage-validator');
                            const healthHistory = await getHealthHistory(storageId, 7);
                            storage.reliability = calculateReliabilityScore(healthHistory);

                            const historicalMetrics = await getCloudSqlHistoricalMetrics(resourceName, 7);
                            const saturationRisk = checkSLOViolations(storage, metrics, historicalMetrics);
                            storage.saturationRisk = saturationRisk;
                        } catch (relErr) {
                            console.error(`[ReliabilitySync] Analysis failed for ${storageId}:`, relErr);
                        }

                        // Phase 112: Workload Shift Detection
                        const shift = detectWorkloadShift(storage.workloadProfile, previousProfile);
                        if (shift.shifted) {
                            console.log(`[WorkloadShift] ${storageId}: ${shift.reason}`);
                            storage.metadata = {
                                ...storage.metadata,
                                workloadShift: {
                                    ...shift,
                                    detectedAt: now.toISOString()
                                }
                            };
                        }
                    } catch (dormErr) {
                        console.error(`[DormancyInsight] Analysis failed for ${storageId}:`, dormErr);
                    }

                    // C. Monitoring Alerts
                    if (storage.alertSettings?.enabled) {
                        const { triggered, alerts } = checkAlertThresholds(metrics, storage.alertSettings);
                        const previouslyAlerting = (storage.activeAlerts || []).length > 0;
                        storage.activeAlerts = triggered ? alerts : [];

                        // Fatigue management & Notifications
                        if (triggered && storage.alertSettings.emailNotifications) {
                            const lastAlertedAt = storage.lastAlertedAt ? (storage.lastAlertedAt instanceof Date ? storage.lastAlertedAt : new Date(storage.lastAlertedAt)) : null;
                            const hoursSinceLastAlert = lastAlertedAt ? (now.getTime() - lastAlertedAt.getTime()) / (1000 * 60 * 60) : 999;

                            // Only notify if new alert OR cooldown period (4h) has passed
                            if (!previouslyAlerting || hoursSinceLastAlert >= 4) {
                                try {
                                    const user = await getUserById(project.userId);
                                    if (user?.email) {
                                        const { subject, html } = storageAlertEmail(project.name, storage.name, alerts);
                                        await sendEmail({ to: user.email, subject, html });
                                        storage.lastAlertedAt = now;
                                    }
                                } catch (emailError) {
                                    console.error(`Failed to send storage alert email for ${storageId}:`, emailError);
                                }
                            }
                        }
                    } else {
                        storage.activeAlerts = [];
                    }

                    // Update project with new state
                    storage.updatedAt = now;
                    storageConfigs[index] = storage;
                    await updateProject(id, { storageConfigs });
                }
            } catch (e) {
                console.error(`Failed to process metrics during sync for ${storageId}:`, e);
            }
        }

        // Handle External Connectors (Auto-Sync & Token Rotation)
        if (storage.metadata?.autoSync && (storage.type === 'supabase' || storage.type === 'mongodb-atlas' || storage.type === 'planetscale' || storage.type === 'neon')) {
            try {
                const { syncExternalConnector, rotateProviderToken, remediateFirewallDrift } = await import('@/lib/gcp/external-sync');

                // Phase 121: Autonomous Firewall Resilience
                try {
                    const fwResult = await remediateFirewallDrift(id, storage);
                    if (fwResult.remediated) {
                        console.log(`[FirewallResilience] Automatically remediated drift for ${storageId}`);
                        storage.metadata = {
                            ...storage.metadata,
                            firewallSynced: true,
                            firewallStatus: 'SYNCED',
                            lastFirewallSyncAt: now.toISOString()
                        };
                    } else if (fwResult.error && fwResult.error.includes('drift')) {
                        storage.metadata = {
                            ...storage.metadata,
                            firewallStatus: 'DRIFT'
                        };
                    } else {
                        storage.metadata = {
                            ...storage.metadata,
                            firewallStatus: 'SYNCED'
                        };
                    }
                } catch (fwErr) {
                    console.warn(`[FirewallResilience] Failed for ${storageId}:`, fwErr);
                }

                // Automated Token Rotation (Phase 110)
                // Rotate tokens every 30 days if rotation is supported
                const lastRotated = storage.lastRotatedAt ? new Date(storage.lastRotatedAt) : storage.createdAt;
                const daysSinceRotation = (now.getTime() - new Date(lastRotated).getTime()) / (1000 * 60 * 60 * 24);

                if (daysSinceRotation >= 30 && (storage.type === 'neon' || storage.type === 'planetscale')) {
                    console.log(`[TokenRotation] Auto-rotating token for ${storageId} (Last rotated: ${daysSinceRotation.toFixed(1)} days ago)`);
                    const rotateResult = await rotateProviderToken(id, storage);
                    if (rotateResult.success) {
                        storage.lastRotatedAt = now;
                        if (rotateResult.providerApiKeySecretId) {
                            storage.providerApiKeySecretId = rotateResult.providerApiKeySecretId;
                        }
                        // Persist immediately after rotation
                        storageConfigs[index] = storage;
                        await updateProject(id, { storageConfigs });
                    }
                }

                const syncResult = await syncExternalConnector(id, storage);

                if (!syncResult.success) {
                    return NextResponse.json({
                        success: false,
                        error: `External sync failed: ${syncResult.error}`
                    }, { status: 502 });
                }

                storage.lastSyncedAt = syncResult.lastSyncedAt;
                storage.updatedAt = now;
                storage.status = 'active';

                if (syncResult.tier) {
                    storage.metadata = {
                        ...storage.metadata,
                        tier: syncResult.tier
                    };
                }

                if (syncResult.replicas) {
                    storage.metadata = {
                        ...storage.metadata,
                        replicas: syncResult.replicas
                    };
                }

                if (syncResult.firewallSynced) {
                    storage.metadata = {
                        ...storage.metadata,
                        firewallSynced: true,
                        lastFirewallSyncAt: syncResult.lastSyncedAt
                    };
                }

                storageConfigs[index] = storage;
                await updateProject(id, { storageConfigs });

                return NextResponse.json({
                    success: true,
                    status: storage.status,
                    lastSyncedAt: storage.lastSyncedAt.toISOString(),
                    activeAlerts: storage.activeAlerts
                });
            } catch (error) {
                console.error(`Sync failed for ${storage.type}:`, error);
                return NextResponse.json({
                    success: false,
                    error: `External sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                }, { status: 502 });
            }
        }

        if (storage.status !== 'provisioning') {
            return NextResponse.json({
                success: true,
                status: storage.status,
                activeAlerts: storage.activeAlerts,
                message: 'Storage is not in provisioning state'
            });
        }

        // Phase 111: Automated Recovery for stuck operations (> 30 mins)
        // CRITICAL FIX: Only run recovery if status is actually 'provisioning'
        const updatedAt = storage.updatedAt ? new Date(storage.updatedAt) : new Date(0);
        const minsInProvisioning = (now.getTime() - updatedAt.getTime()) / (1000 * 60);

        if (storage.status === 'provisioning' && minsInProvisioning > 30) {
            console.warn(`[StorageSync] Operation timeout detected for ${storageId} (${minsInProvisioning.toFixed(1)} mins). Attempting recovery...`);

            // Direct resource state check for GCP types
            if (storage.type.includes('cloud-sql')) {
                try {
                    const { getInstance } = await import('@/lib/gcp/cloudsql');
                    const instance = await getInstance(storage.metadata?.resourceName as string);
                    if (instance && (instance as Record<string, unknown>).state === 'RUNNABLE') {
                        storage.status = 'active';
                        storage.updatedAt = now;
                        storageConfigs[index] = storage;
                        await updateProject(id, { storageConfigs });
                        return NextResponse.json({ success: true, status: 'active', message: 'Instance recovered from timeout' });
                    }
                } catch (e) { console.warn(`[StorageSync] GCP recovery check failed:`, e); }
            } else if (storage.type === 'memorystore-redis') {
                try {
                    const { getInstance } = await import('@/lib/gcp/memorystore');
                    const instance = await getInstance(storage.metadata?.resourceName as string, (storage.metadata?.region as string) || project.region || 'us-central1');
                    if (instance.state === 'READY') {
                        storage.status = 'active';
                        storage.updatedAt = now;
                        storageConfigs[index] = storage;
                        await updateProject(id, { storageConfigs });
                        return NextResponse.json({ success: true, status: 'active', message: 'Redis recovered from timeout' });
                    }
                } catch (e) { console.warn(`[StorageSync] Redis recovery check failed:`, e); }
            }

            // For external projects that might have finished without us knowing
            if (storage.type === 'neon' || storage.type === 'supabase') {
                const { getExternalOperationStatus } = await import('@/lib/gcp/external-sync');
                const operationName = storage.metadata?.operationName as string;
                if (operationName) {
                    const statusResult = await getExternalOperationStatus(operationName, storage.metadata || {}, storage.providerApiKeySecretId);
                    if (statusResult.status === 'DONE') {
                        storage.status = 'active';
                        storage.lastSyncedAt = now;
                        storage.updatedAt = now;
                        storageConfigs[index] = storage;
                        await updateProject(id, { storageConfigs });
                        return NextResponse.json({ success: true, status: 'active', message: 'Stuck operation recovered successfully' });
                    }
                }
            }

            // If still stuck or GCP operation, mark as error to allow user intervention
            storage.status = 'error';
            storage.lastError = `Provisioning timed out after ${minsInProvisioning.toFixed(0)} minutes. Please verify resource state in the provider console.`;
            storage.updatedAt = now;
            storageConfigs[index] = storage;
            await updateProject(id, { storageConfigs });
            return NextResponse.json({ success: true, status: 'error', error: storage.lastError });
        }

        // Phase 117: Handle Automated Ingestion Lifecycle (Dump -> Provision -> Import)
        const dumpBuildId = storage.metadata?.dumpBuildId as string;
        const ingestionStage = storage.metadata?.ingestionStage as string;

        if (dumpBuildId && ingestionStage === 'PROVISIONING_INSTANCE') {
            try {
                const { getBuildStatus } = await import('@/lib/gcp/cloudbuild');
                const buildStatus = await getBuildStatus(dumpBuildId);

                if (buildStatus.status === 'SUCCESS') {
                    console.log(`[Ingestion] Dump Build ${dumpBuildId} finished. Ready for import.`);
                    // We keep PROVISIONING_INSTANCE until the Cloud SQL operation itself is DONE
                    // The standard Cloud SQL polling below will handle the transition once the instance is ready.
                    storage.metadata = {
                        ...storage.metadata,
                        dumpBuildStatus: 'SUCCESS'
                    };
                } else if (buildStatus.status === 'FAILURE' || buildStatus.status === 'TIMEOUT') {
                    storage.status = 'error';
                    storage.lastError = `Automated data dump failed (Build: ${dumpBuildId}). Please check Cloud Build logs.`;
                    storage.updatedAt = now;
                    storageConfigs[index] = storage;
                    await updateProject(id, { storageConfigs });
                    return NextResponse.json({ success: true, status: 'error', error: storage.lastError });
                }
            } catch (buildErr) {
                console.error(`[Ingestion] Failed to poll dump build ${dumpBuildId}:`, buildErr);
            }
        }

        const operationName = storage.metadata?.operationName as string;

        if (!operationName) {
            console.warn(`[StorageSync] Sync triggered for provisioning connector ${storageId} without operation metadata.`);
            // If no operation name, we can't sync. Maybe it's stuck.
            return NextResponse.json({
                success: false,
                error: 'No active provisioning operation found. The instance may need manual verification in the GCP Console.'
            }, { status: 400 });
        }

        // Poll GCP for status
        let statusResult;
        try {
            if (storage.type.startsWith('cloud-sql')) {
                statusResult = await getCloudSqlOperationStatus(operationName);
            } else if (storage.type === 'memorystore-redis') {
                statusResult = await getMemorystoreOperationStatus(operationName);
            } else if (storage.type === 'firestore') {
                statusResult = await getFirestoreOperationStatus(operationName);
            } else if (storage.type === 'neon' || storage.type === 'supabase') {
                const { getExternalOperationStatus } = await import('@/lib/gcp/external-sync');
                statusResult = await getExternalOperationStatus(operationName, storage.metadata || {}, storage.providerApiKeySecretId);
            } else {
                return NextResponse.json({
                    success: false,
                    error: `Unsupported storage type for sync: ${storage.type}`
                }, { status: 400 });
            }
        } catch (error) {
            console.error('Failed to get operation status:', error);
            return NextResponse.json({ success: false, error: 'Failed to poll GCP status' }, { status: 500 });
        }

        if (statusResult.status === 'DONE') {
            if (statusResult.error) {
                storage.status = 'error';
                storage.lastError = statusResult.error;
                storage.updatedAt = now;
                storageConfigs[index] = storage;
                await updateProject(id, { storageConfigs });
                return NextResponse.json({ success: true, status: 'error', error: storage.lastError });
            }

            // Handle Import/Export/Clone/Sync Completion
            const lastOp = storage.metadata?.lastOperation;

            if (lastOp === 'sync_schema_export') {
                // Export for Sync finished, now trigger Import on this target instance
                try {
                    const syncStorageUri = storage.metadata?.syncStorageUri as string;
                    const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    const targetDatabase = (storage.metadata?.syncTargetDatabase as string) || project.slug;

                    const { finalizeSync } = await import('@/lib/gcp/schema-sync');
                    const importOp = await finalizeSync(resourceName, syncStorageUri, targetDatabase);

                    storage.metadata = {
                        ...storage.metadata,
                        operationName: importOp,
                        lastOperation: 'sync_schema_import'
                    };
                    storageConfigs[index] = storage;
                    await updateProject(id, { storageConfigs });
                    return NextResponse.json({
                        success: true,
                        status: 'provisioning',
                        message: 'Schema export complete, now importing into target...'
                    });
                } catch (importErr) {
                    console.error('[SyncSchemaImport] Failed to trigger import:', importErr);
                    storage.status = 'error';
                    storage.lastError = `Schema export complete, but import trigger failed: ${importErr instanceof Error ? importErr.message : 'Unknown'}`;
                }
            } else if (lastOp === 'sync_schema_import') {
                // Final sync step complete
                storage.status = 'active';
                storage.lastSyncedAt = now;
                storage.updatedAt = now;
                storage.metadata = {
                    ...storage.metadata,
                    lastOperation: undefined,
                    operationName: undefined,
                    syncStorageUri: undefined,
                    syncSourceInstance: undefined,
                    syncTargetDatabase: undefined
                };

                storageConfigs[index] = storage;
                await updateProject(id, { storageConfigs });

                return NextResponse.json({
                    success: true,
                    status: 'active',
                    message: 'Schema synchronization completed successfully',
                    lastSyncedAt: storage.lastSyncedAt.toISOString()
                });
            } else if (lastOp === 'migrate_region') {
                // Regional migration finished. Update resource name and region.
                const targetInstanceName = storage.metadata?.targetInstanceName as string;
                const targetRegion = storage.metadata?.targetRegion as string;

                storage.status = 'active';
                storage.region = targetRegion;
                storage.metadata = {
                    ...storage.metadata,
                    resourceName: targetInstanceName || storage.metadata?.resourceName,
                    region: targetRegion || storage.metadata?.region,
                    lastOperation: undefined,
                    operationName: undefined,
                    targetInstanceName: undefined,
                    targetRegion: undefined
                };

                // For Cloud SQL, we also need to update the connection string secret if it's a provisioning-native instance
                if (storage.type.includes('cloud-sql') && storage.connectionStringSecretId) {
                    try {
                        // const { getGcpProjectNumber } = await import('@/lib/gcp/auth');
                        const gcpProjectId = storage.providerProjectId || process.env.GCP_PROJECT_ID;
                        const dbType = storage.type.includes('postgres') ? 'postgresql' : 'mysql';
                        const newConnStr = `${dbType}://deployify-sa@/${project.slug}?host=/cloudsql/${gcpProjectId}:${targetRegion}:${targetInstanceName}&enable_iam_auth=true`;

                        const { upsertSecret } = await import('@/lib/gcp/secrets');
                        await upsertSecret(storage.connectionStringSecretId, newConnStr);
                    } catch (secErr) {
                        console.error(`[AutoAlign] Failed to update connection string for ${storageId}:`, secErr);
                    }
                }

                storageConfigs[index] = storage;
                await updateProject(id, { storageConfigs });

                return NextResponse.json({
                    success: true,
                    status: 'active',
                    message: 'Regional auto-alignment completed successfully'
                });
            } else if (lastOp === 'failover_promotion') {
                // Automated failover promotion finished. Update resource name and secret.
                const promotedReplicaName = storage.metadata?.promotedReplicaName as string;
                const promotedReplicaId = storage.metadata?.promotedReplicaId as string;

                // Find the replica metadata to get its region
                const replicas = (storage.metadata?.replicas as Array<{ id: string, name: string, region: string }>) || [];
                const replicaInfo = replicas.find(r => r.id === promotedReplicaId || r.name === promotedReplicaName);
                const targetRegion = (replicaInfo?.region as string) || storage.region;

                storage.status = 'active';
                storage.region = targetRegion;
                storage.metadata = {
                    ...storage.metadata,
                    resourceName: promotedReplicaName,
                    region: targetRegion,
                    lastOperation: undefined,
                    operationName: undefined,
                    promotedReplicaId: undefined,
                    promotedReplicaName: undefined,
                    // Remove the promoted replica from the list as it's now primary
                    replicas: replicas.filter(r => r.id !== promotedReplicaId && r.name !== promotedReplicaName)
                };

                // Update connection string secret with the new primary
                if (storage.connectionStringSecretId) {
                    try {
                        const gcpProjectId = storage.providerProjectId || process.env.GCP_PROJECT_ID;
                        const dbType = storage.type.includes('postgres') ? 'postgresql' : 'mysql';
                        const newConnStr = `${dbType}://deployify-sa@/${project.slug}?host=/cloudsql/${gcpProjectId}:${targetRegion}:${promotedReplicaName}&enable_iam_auth=true`;

                        const { upsertSecret } = await import('@/lib/gcp/secrets');
                        await upsertSecret(storage.connectionStringSecretId, newConnStr);
                    } catch (secErr) {
                        console.error(`[Failover] Failed to update secret for ${storageId}:`, secErr);
                    }
                }

                storageConfigs[index] = storage;
                await updateProject(id, { storageConfigs });

                return NextResponse.json({
                    success: true,
                    status: 'active',
                    message: 'Automated failover completed successfully. New primary promoted.'
                });
            } else if (lastOp === 'import' || lastOp === 'export' || lastOp === 'clone_export' || lastOp === 'clone_import' || lastOp === 'ingestion_db_create') {
                if (lastOp === 'clone_export') {
                    // Export finished, now trigger Import on the clone
                    try {
                        const portabilityUri = storage.metadata?.portabilityUri as string;
                        const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');

                        let importOperation;
                        if (storage.type.includes('cloud-sql')) {
                            const { importInstance } = await import('@/lib/gcp/cloudsql');
                            importOperation = await importInstance(resourceName, portabilityUri, project.slug);
                        } else if (storage.type === 'memorystore-redis') {
                            const { importInstance } = await import('@/lib/gcp/memorystore');
                            const region = (storage.metadata?.region as string) || project.region || 'us-central1';
                            importOperation = await importInstance(resourceName, region, portabilityUri);
                        } else if (storage.type === 'firestore') {
                            const { importDocuments } = await import('@/lib/gcp/firestore-admin');
                            importOperation = await importDocuments(resourceName, portabilityUri);
                        }

                        if (importOperation) {
                            storage.metadata = {
                                ...storage.metadata,
                                operationName: importOperation,
                                lastOperation: 'clone_import'
                            };
                            storageConfigs[index] = storage;
                            await updateProject(id, { storageConfigs });
                            return NextResponse.json({
                                success: true,
                                status: 'provisioning',
                                message: 'Data export complete, now importing into clone...'
                            });
                        }
                    } catch (importErr) {
                        console.error('[CloneImport] Failed to trigger import:', importErr);
                        storage.status = 'error';
                        storage.lastError = `Export complete, but import trigger failed: ${importErr instanceof Error ? importErr.message : 'Unknown'}`;
                    }
                } else if (lastOp === 'ingestion_db_create') {
                    // Database created, now trigger import for this database
                    const pendingImports = storage.metadata?.pendingImports as Array<{ database: string, uri: string }> | undefined;
                    const currentIndex = (storage.metadata?.currentImportIndex as number) ?? 0;
                    const currentImport = pendingImports?.[currentIndex];
                    const instanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');

                    if (currentImport) {
                        try {
                            const { importInstance } = await import('@/lib/gcp/cloudsql');
                            const importOp = await importInstance(instanceName, currentImport.uri, currentImport.database);

                            storage.metadata = {
                                ...storage.metadata,
                                operationName: importOp,
                                lastOperation: 'import',
                                ingestionStage: `IMPORTING_DATABASE_${currentIndex + 1}_OF_${pendingImports?.length}`
                            };
                            storageConfigs[index] = storage;
                            await updateProject(id, { storageConfigs });
                            return NextResponse.json({
                                success: true,
                                status: 'provisioning',
                                message: `Database ${currentImport.database} created. Starting import...`
                            });
                        } catch (importErr) {
                            console.error(`[Ingestion] Failed to trigger import for ${currentImport.database}:`, importErr);
                            storage.status = 'error';
                            storage.lastError = `Import failed for ${currentImport.database}: ${importErr instanceof Error ? importErr.message : 'Unknown'}`;
                        }
                    }
                } else {
                    // Phase 132: Multi-database Ingestion Orchestration
                    const pendingImports = storage.metadata?.pendingImports as Array<{ database: string, uri: string }> | undefined;
                    const currentIndex = (storage.metadata?.currentImportIndex as number) ?? 0;

                    if (pendingImports && currentIndex < pendingImports.length - 1) {
                        // More imports pending - Trigger NEXT database creation
                        const nextIndex = currentIndex + 1;
                        const nextImport = pendingImports[nextIndex];
                        const instanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');

                        try {
                            const { createDatabase } = await import('@/lib/gcp/cloudsql');
                            const dbOp = await createDatabase(instanceName, nextImport.database);

                            storage.metadata = {
                                ...storage.metadata,
                                operationName: dbOp,
                                lastOperation: 'ingestion_db_create',
                                currentImportIndex: nextIndex,
                                ingestionStage: `CREATING_DATABASE_${nextIndex + 1}_OF_${pendingImports.length}`
                            };

                            storageConfigs[index] = storage;
                            await updateProject(id, { storageConfigs });

                            return NextResponse.json({
                                success: true,
                                status: 'provisioning',
                                message: `Import for database ${currentIndex + 1} complete. Creating database ${nextImport.database}...`
                            });

                        } catch (dbErr) {
                            // If database creation fails (e.g. already exists), try to skip to import
                            console.warn(`[Ingestion] Database creation failed for ${nextImport.database}, attempting direct import:`, dbErr);
                            try {
                                const { importInstance } = await import('@/lib/gcp/cloudsql');
                                const importOp = await importInstance(instanceName, nextImport.uri, nextImport.database);
                                storage.metadata = {
                                    ...storage.metadata,
                                    operationName: importOp,
                                    lastOperation: 'import',
                                    currentImportIndex: nextIndex,
                                    ingestionStage: `IMPORTING_DATABASE_${nextIndex + 1}_OF_${pendingImports.length}`
                                };
                                await updateProject(id, { storageConfigs });
                                return NextResponse.json({ success: true, status: 'provisioning', message: `Database ${nextImport.database} already exists. Starting import...` });
                            } catch (importErr) {
                                storage.status = 'error';
                                storage.lastError = `Failed to process ${nextImport.database}: ${importErr instanceof Error ? importErr.message : 'Unknown'}`;
                            }
                        }
                    } else {
                        // Normal import/export or final clone_import / multi-db ingestion finished
                        storage.status = 'active';
                        storage.lastSyncedAt = now;
                        storage.updatedAt = now;

                        const baseIngestionUri = storage.metadata?.baseIngestionUri as string;

                        // Phase 132: Automated GCS Cleanup
                        if (baseIngestionUri) {
                            try {
                                const { deleteFolder } = await import('@/lib/gcp/gcs');
                                await deleteFolder(baseIngestionUri);
                                console.log(`[IngestionCleanup] Successfully cleaned up GCS artifacts at ${baseIngestionUri}`);
                            } catch (cleanupErr) {
                                console.warn(`[IngestionCleanup] Failed to cleanup GCS:`, cleanupErr);
                            }
                        }

                        storage.metadata = {
                            ...storage.metadata,
                            lastOperation: undefined,
                            operationName: undefined,
                            portabilityUri: lastOp === 'clone_import' ? undefined : storage.metadata?.portabilityUri,
                            baseIngestionUri: undefined,
                            pendingImports: undefined,
                            currentImportIndex: undefined,
                            ingestionStage: storage.metadata?.ingestedFrom ? 'COMPLETED' : undefined,
                            readyForCutover: !!storage.metadata?.ingestedFrom
                        };

                        storageConfigs[index] = storage;
                        await updateProject(id, { storageConfigs });

                        return NextResponse.json({
                            success: true,
                            status: 'active',
                            message: `${lastOp === 'clone_import' ? 'Clone with data' : (lastOp === 'import' ? 'Import' : 'Export')} completed successfully`,
                            lastSyncedAt: storage.lastSyncedAt.toISOString()
                        });
                    }
                }
            }

            // Check if we need follow-up operations (e.g. create DB/User for Cloud SQL)
            const isCloudSql = storage.type.startsWith('cloud-sql');

            if (isCloudSql) {
                const hasCreatedDb = storage.metadata?.dbCreated;
                const dbOperationName = storage.metadata?.dbOperationName as string;
                const userOperationName = storage.metadata?.userOperationName as string;

                try {
                    const { createDatabase, getOperationStatus } = await import('@/lib/gcp/cloudsql');
                    const instanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    const dbName = project.slug;

                    // Step 2: Create Database if not started
                    if (!hasCreatedDb && !dbOperationName) {
                        const opName = await createDatabase(instanceName, dbName);
                        storage.metadata = { ...storage.metadata, dbOperationName: opName };
                        await updateProject(id, { storageConfigs });
                        return NextResponse.json({ success: true, status: 'provisioning', message: 'Creating database...' });
                    }

                    // Step 3: Poll Database creation
                    if (dbOperationName && !hasCreatedDb) {
                        const dbStatus = await getOperationStatus(dbOperationName);
                        if (dbStatus.status === 'DONE') {
                            if (dbStatus.error) throw new Error(`DB creation failed: ${dbStatus.error}`);
                            storage.metadata = { ...storage.metadata, dbCreated: true, defaultDb: dbName };
                            await updateProject(id, { storageConfigs });
                            // Continue to user creation in next poll or here? Let's poll again for simplicity.
                            return NextResponse.json({ success: true, status: 'provisioning', message: 'Database created, now creating user...' });
                        }
                        return NextResponse.json({ success: true, status: 'provisioning', message: 'Database creation in progress...' });
                    }

                    // Step 4: Create User if not started
                    if (hasCreatedDb && !userOperationName) {
                        const dbType = storage.type.includes('postgres') ? 'postgres' : 'mysql';
                        const gcpProjectId = storage.providerProjectId || (process.env.GCP_PROJECT_ID as string);
                        const projectNumber = await getGcpProjectNumber(gcpProjectId);
                        const computeSaEmail = projectNumber ? `${projectNumber}-compute@developer.gserviceaccount.com` : null;

                        const opName = await createCloudSqlUser(
                            instanceName,
                            computeSaEmail || 'deployify-sa',
                            undefined,
                            dbType as 'postgres' | 'mysql'
                        );
                        storage.metadata = { ...storage.metadata, userOperationName: opName };
                        await updateProject(id, { storageConfigs });
                        return NextResponse.json({ success: true, status: 'provisioning', message: 'Creating IAM user...' });
                    }

                    // Step 5: Poll User creation
                    if (userOperationName) {
                        const userStatus = await getOperationStatus(userOperationName);
                        if (userStatus.status === 'DONE') {
                            if (userStatus.error) throw new Error(`User creation failed: ${userStatus.error}`);
                            storage.metadata = { ...storage.metadata, userCreated: true };

                            // Phase 132: Multi-database Ingestion Entry Point
                            const pendingImports = storage.metadata?.pendingImports as Array<{ database: string, uri: string }> | undefined;
                            const dumpBuildStatus = storage.metadata?.dumpBuildStatus as string;

                            if (pendingImports && pendingImports.length > 0) {
                                if (storage.metadata?.dumpBuildId && dumpBuildStatus !== 'SUCCESS') {
                                    // Wait for dump build to finish before starting import
                                    storageConfigs[index] = storage;
                                    await updateProject(id, { storageConfigs });
                                    return NextResponse.json({
                                        success: true,
                                        status: 'provisioning',
                                        message: 'Instance ready, waiting for source data dump to complete...'
                                    });
                                }

                                try {
                                    const { createDatabase } = await import('@/lib/gcp/cloudsql');
                                    const firstImport = pendingImports[0];

                                    // 1. Trigger first database creation (Phase 132)
                                    const dbOp = await createDatabase(instanceName, firstImport.database);

                                    storage.metadata = {
                                        ...storage.metadata,
                                        operationName: dbOp,
                                        lastOperation: 'ingestion_db_create',
                                        currentImportIndex: 0,
                                        ingestionStage: `CREATING_DATABASE_1_OF_${pendingImports.length}`
                                    };
                                    await updateProject(id, { storageConfigs });
                                    return NextResponse.json({
                                        success: true,
                                        status: 'provisioning',
                                        message: `Cloud SQL ready. Creating database ${firstImport.database}...`
                                    });
                                } catch (dbErr) {
                                    // Fallback: If creation fails, try to trigger import immediately
                                    console.warn(`[Ingestion] First database creation failed, attempting direct import:`, dbErr);
                                    try {
                                        const { importInstance } = await import('@/lib/gcp/cloudsql');
                                        const firstImport = pendingImports[0];
                                        const importOp = await importInstance(instanceName, firstImport.uri, firstImport.database);
                                        storage.metadata = {
                                            ...storage.metadata,
                                            operationName: importOp,
                                            lastOperation: 'import',
                                            currentImportIndex: 0,
                                            ingestionStage: `IMPORTING_DATABASE_1_OF_${pendingImports.length}`
                                        };
                                        await updateProject(id, { storageConfigs });
                                        return NextResponse.json({ success: true, status: 'provisioning', message: `Database ${firstImport.database} exists. Starting import...` });
                                    } catch (importErr) {
                                        storage.status = 'error';
                                        storage.lastError = `Instance ready, but data import failed: ${importErr instanceof Error ? importErr.message : 'Unknown'}`;
                                    }
                                }
                            } else {
                                storage.status = 'active';
                                storage.lastSyncedAt = now;

                                // Phase 118: Mark as ready for cutover if it was an ingestion
                                if (storage.metadata?.ingestedFrom) {
                                    storage.metadata = {
                                        ...storage.metadata,
                                        readyForCutover: true
                                    };
                                }
                            }
                        } else {
                            return NextResponse.json({ success: true, status: 'provisioning', message: 'User creation in progress...' });
                        }
                    }
                } catch (e) {
                    console.error('Failed follow-up Cloud SQL provisioning:', e);
                    storage.status = 'error';
                    storage.lastError = `Instance ready, but DB/User creation failed: ${e instanceof Error ? e.message : 'Unknown'}`;
                }
            } else if (storage.type === 'memorystore-redis') {
                try {
                    const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    const region = (storage.metadata?.region as string) || project.region || 'us-central1';

                    const instance = await getMemorystoreInstance(resourceName, region);
                    if (instance.host) {
                        const newConnectionString = `redis://${instance.host}:${instance.port || 6379}`;
                        const { upsertSecret } = await import('@/lib/gcp/secrets');
                        await upsertSecret(`deployify-${id}-${storageId}-conn`, newConnectionString);

                        storage.status = 'active';
                        storage.lastSyncedAt = now;
                    }
                } catch (e) {
                    console.error('Failed to fetch Memorystore IP during sync:', e);
                    storage.status = 'error';
                    storage.lastError = `Instance ready, but failed to retrieve connectivity details: ${e instanceof Error ? e.message : 'Unknown'}`;
                }
            } else {
                storage.status = 'active';
                storage.lastSyncedAt = now;
            }

            // Ensure top-level region is synced from metadata if not already set
            if (!storage.region && storage.metadata?.region) {
                storage.region = storage.region as string;
            }

            // Final Fetch for detailed metadata (HA/PITR)
            if (isCloudSql) {
                try {
                    const instanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    const instance = await getCloudSqlInstance(instanceName);
                    const instanceSettings = instance.settings as {
                        availabilityType?: string;
                        backupConfiguration?: { pointInTimeRecoveryEnabled?: boolean };
                    } | undefined;
                    storage.metadata = {
                        ...storage.metadata,
                        highAvailability: instanceSettings?.availabilityType === 'REGIONAL',
                        pitrEnabled: !!instanceSettings?.backupConfiguration?.pointInTimeRecoveryEnabled,
                        deletionProtection: !!instance.deletionProtectionEnabled
                    };
                    if (instance.region) {
                        storage.region = instance.region as string;
                    }

                    // Sync Read Replicas Status
                    const replicas = (storage.metadata?.replicas as Array<{
                        id: string;
                        name: string;
                        status: string;
                        region?: string;
                        tier?: string;
                        health?: {
                            status: string;
                            latency: number;
                            baselineLatency?: number;
                            isDegraded?: boolean;
                            timestamp?: string;
                        };
                    }>) || [];
                    if (replicas.length > 0) {
                        const replicaResults = await Promise.all(replicas.map(async (r) => {
                            try {
                                const replicaData = await getCloudSqlInstance(r.name);
                                // If replica was promoted, it is now a standalone instance (CLOUD_SQL_INSTANCE)
                                // We should remove it from the master's replica list
                                if (replicaData.instanceType === 'CLOUD_SQL_INSTANCE') {
                                    return null;
                                }

                                const replicaStatus = replicaData.state === 'RUNNING' ? 'active' : (replicaData.state === 'PENDING_CREATE' ? 'provisioning' : 'error');

                                // Perform health heartbeat for active replicas (Phase 106)
                                let healthMetadata = r.health;
                                if (replicaStatus === 'active') {
                                    try {
                                        const health = await checkConnectivityHealth(storage.type, undefined, {
                                            resourceName: r.name,
                                            region: replicaData.region as string,
                                            health: healthMetadata
                                        });

                                        const newBaseline = calculateEWMA(health.latency, healthMetadata?.baselineLatency);
                                        const isDegraded = detectDegradation(health.latency, newBaseline);

                                        healthMetadata = {
                                            status: health.status === 'unhealthy' ? 'unhealthy' : (isDegraded ? 'degraded' : 'healthy'),
                                            latency: health.latency,
                                            baselineLatency: parseFloat(newBaseline.toFixed(2)),
                                            isDegraded,
                                            timestamp: health.timestamp
                                        };
                                    } catch (hErr) {
                                        console.error(`[ReplicaHealth] Heartbeat failed for ${r.name}:`, hErr);
                                    }
                                }

                                return {
                                    ...r,
                                    status: replicaStatus,
                                    region: replicaData.region as string,
                                    tier: (replicaData.settings as { tier?: string })?.tier,
                                    health: healthMetadata
                                };
                            } catch (e) {
                                // If replica is not found, it might have been deleted manually in GCP
                                console.error(`[ReplicaSync] Failed for ${r.name}:`, e);
                                return null;
                            }
                        }));

                        // Filter out promoted or deleted replicas
                        const updatedReplicas = replicaResults.filter(r => r !== null);
                        storage.metadata = { ...storage.metadata, replicas: updatedReplicas };
                    }
                } catch (e) {
                    console.error('Failed to fetch Cloud SQL details for final metadata sync:', e);
                }
            }

            storage.updatedAt = now;
            storageConfigs[index] = storage;

            await updateProject(id, { storageConfigs });

            return NextResponse.json({
                success: true,
                status: storage.status,
                lastSyncedAt: storage.lastSyncedAt?.toISOString(),
                activeAlerts: storage.activeAlerts,
                error: storage.lastError
            });
        }

        return NextResponse.json({
            success: true,
            status: 'provisioning',
            message: storage.metadata?.lastOperation === 'import' ? 'Import in progress...' :
                     storage.metadata?.lastOperation === 'export' ? 'Export in progress...' :
                     storage.metadata?.lastOperation === 'sync_schema_export' ? 'Sync export in progress...' :
                     storage.metadata?.lastOperation === 'sync_schema_import' ? 'Sync import in progress...' :
                     'Operation still in progress'
        });

    } catch (error) {
        console.error('Storage sync error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error during sync' }, { status: 500 });
    }
}
