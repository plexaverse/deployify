import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { getOperationStatus as getCloudSqlOperationStatus, getInstance as getCloudSqlInstance } from '@/lib/gcp/cloudsql';
import { getOperationStatus as getMemorystoreOperationStatus, getInstance as getMemorystoreInstance } from '@/lib/gcp/memorystore';
import { getOperationStatus as getFirestoreOperationStatus } from '@/lib/gcp/firestore-admin';
import type { StorageConfig } from '@/types';
import { getCloudSqlMetrics, getMemorystoreMetrics, checkAlertThresholds } from '@/lib/gcp/monitoring';
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

        // 1. Check monitoring alerts for active connectors
        if (storage.status === 'active' && storage.metadata?.provisioned && storage.alertSettings?.enabled) {
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
                    const { triggered, alerts } = checkAlertThresholds(metrics, storage.alertSettings);
                    const previouslyAlerting = (storage.activeAlerts || []).length > 0;
                    storage.activeAlerts = triggered ? alerts : [];
                    storage.updatedAt = now;

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

                    // Update project with new alert status
                    storageConfigs[index] = storage;
                    await updateProject(id, { storageConfigs });
                }
            } catch (e) {
                console.error(`Failed to check alerts during sync for ${storageId}:`, e);
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

            // Handle Import/Export Completion
            const lastOp = storage.metadata?.lastOperation;
            if (lastOp === 'import' || lastOp === 'export') {
                storage.status = 'active';
                storage.lastSyncedAt = now;
                storage.updatedAt = now;
                storage.metadata = { ...storage.metadata, lastOperation: undefined, operationName: undefined };

                storageConfigs[index] = storage;
                await updateProject(id, { storageConfigs });

                return NextResponse.json({
                    success: true,
                    status: 'active',
                    message: `${lastOp === 'import' ? 'Import' : 'Export'} completed successfully`,
                    lastSyncedAt: storage.lastSyncedAt.toISOString()
                });
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
