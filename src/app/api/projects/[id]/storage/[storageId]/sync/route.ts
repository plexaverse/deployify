import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { getOperationStatus as getCloudSqlOperationStatus, getInstance as getCloudSqlInstance } from '@/lib/gcp/cloudsql';
import { getOperationStatus as getMemorystoreOperationStatus, getInstance as getMemorystoreInstance } from '@/lib/gcp/memorystore';
import { getOperationStatus as getFirestoreOperationStatus } from '@/lib/gcp/firestore-admin';
import { checkConnectivityHealth } from '@/lib/gcp/storage-validator';
import { calculateEWMA, isDegraded as detectDegradation } from '@/lib/gcp/health-utils';
import type { StorageConfig } from '@/types';
import { getCloudSqlMetrics, getMemorystoreMetrics, checkAlertThresholds, getScalingRecommendations, getResourceDormancy } from '@/lib/gcp/monitoring';
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
                // Baseline connectivity metadata if missing to optimize future heartbeats
                if (!storage.metadata?.connectivity && storage.connectionStringSecretId && storage.type !== 'firestore') {
                    try {
                        const { getSecretValue } = await import('@/lib/gcp/secrets');
                        const connectionString = await getSecretValue(storage.connectionStringSecretId);

                        // Use URL to parse connection string
                        if (connectionString.startsWith('mongodb+srv://')) {
                            const url = new URL(connectionString);
                            storage.metadata = {
                                ...storage.metadata,
                                connectivity: { host: url.hostname, port: 27017 }
                            };
                        } else if (!connectionString.includes('enable_iam_auth=true')) {
                            const url = new URL(connectionString);
                            if (url.hostname && url.hostname !== 'localhost') {
                                storage.metadata = {
                                    ...storage.metadata,
                                    connectivity: {
                                        host: url.hostname,
                                        port: url.port ? parseInt(url.port, 10) : (
                                            storage.type.includes('postgres') || storage.type === 'supabase' ? 5432 :
                                            storage.type.includes('mysql') || storage.type === 'planetscale' ? 3306 :
                                            storage.type === 'memorystore-redis' ? 6379 :
                                            storage.type === 'mongodb-atlas' ? 27017 : 0
                                        )
                                    }
                                };
                            }
                        }
                    } catch (baselineErr) {
                        console.error(`[HealthHeartbeat] Failed to baseline connectivity for ${storageId}:`, baselineErr);
                    }
                }

                const health = await checkConnectivityHealth(storage.type, storage.connectionStringSecretId, storage.metadata);

                // Predictive Health: Implement EWMA (alpha=0.2) for baseline latency
                const currentHealth = storage.metadata?.health as { baselineLatency?: number } | undefined;
                const newBaseline = calculateEWMA(health.latency, currentHealth?.baselineLatency);

                // Detect degradation
                const isDegraded = detectDegradation(health.latency, newBaseline);
                const finalStatus = health.status === 'unhealthy' ? 'unhealthy' : (isDegraded ? 'degraded' : 'healthy');

                storage.metadata = {
                    ...storage.metadata,
                    health: {
                        status: finalStatus,
                        latency: health.latency,
                        baselineLatency: parseFloat(newBaseline.toFixed(2)),
                        isDegraded,
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
                    metrics = await getCloudSqlMetrics(resourceName);
                } else if (storage.type === 'memorystore-redis') {
                    metrics = await getMemorystoreMetrics(resourceName, region);
                }

                if (metrics) {
                    // A. Optimization Intelligence: Analyze for scaling recommendations
                    try {
                        const recommendations = await getScalingRecommendations(storage.type, metrics, storage.metadata);
                        storage.metadata = {
                            ...storage.metadata,
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

        // Handle External Connectors (Auto-Sync)
        if (storage.metadata?.autoSync && (storage.type === 'supabase' || storage.type === 'mongodb-atlas' || storage.type === 'planetscale')) {
            try {
                const { syncExternalConnector } = await import('@/lib/gcp/external-sync');
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

            // Handle Import/Export/Clone Completion
            const lastOp = storage.metadata?.lastOperation;
            if (lastOp === 'import' || lastOp === 'export' || lastOp === 'clone_export' || lastOp === 'clone_import') {
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
                } else {
                    // Normal import/export or final clone_import finished
                    storage.status = 'active';
                    storage.lastSyncedAt = now;
                    storage.updatedAt = now;
                    storage.metadata = {
                        ...storage.metadata,
                        lastOperation: undefined,
                        operationName: undefined,
                        portabilityUri: lastOp === 'clone_import' ? undefined : storage.metadata?.portabilityUri
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

            // Check if we need follow-up operations (e.g. create DB/User for Cloud SQL)
            const isCloudSql = storage.type.startsWith('cloud-sql');

            if (isCloudSql) {
                const hasCreatedDb = storage.metadata?.dbCreated;
                const dbOperationName = storage.metadata?.dbOperationName as string;
                const userOperationName = storage.metadata?.userOperationName as string;

                try {
                    const { createDatabase, createUser, getOperationStatus } = await import('@/lib/gcp/cloudsql');
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
                        const opName = await createUser(instanceName, 'deployify-sa');
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
                            storage.status = 'active';
                            storage.lastSyncedAt = now;
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
                storage.region = storage.metadata.region as string;
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
                     'Operation still in progress'
        });

    } catch (error) {
        console.error('Storage sync error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error during sync' }, { status: 500 });
    }
}
