import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { getOperationStatus as getCloudSqlOperationStatus, getInstance as getCloudSqlInstance } from '@/lib/gcp/cloudsql';
import { getOperationStatus as getMemorystoreOperationStatus, getInstance as getMemorystoreInstance } from '@/lib/gcp/memorystore';
import { getOperationStatus as getFirestoreOperationStatus } from '@/lib/gcp/firestore-admin';
import { getOperationStatus as getSpannerOperationStatus } from '@/lib/gcp/spanner';
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
            const providerApiKey = storage.metadata?.providerApiKey as string;

            if (process.env.MOCK_DB !== 'true' && !providerApiKey) {
                console.warn(`[StorageSync] Auto-sync triggered for ${storage.type} (${storageId}) without Provider API Key.`);
                return NextResponse.json({
                    success: false,
                    error: `Auto-sync requires a Provider API Key for ${storage.type}. Please update the connector settings.`
                }, { status: 400 });
            }

            try {
                let newConnectionString = '';

                if (process.env.MOCK_DB === 'true') {
                    // Simulate API fetch delay
                    await new Promise(resolve => setTimeout(resolve, 500));
                    console.log(`[StorageSync] MOCK: Syncing ${storage.type} connector ${storageId}`);
                    newConnectionString = storage.type === 'supabase'
                        ? 'postgresql://postgres:mock@db.supabase.co:5432/postgres'
                        : storage.type === 'mongodb-atlas'
                        ? 'mongodb+srv://mock:password@cluster.mongodb.net/test'
                        : 'mysql://mock:password@aws.connect.psdb.cloud/test';
                } else {
                    // Real API Logic Implementation (Logic-Ready Structures)
                    if (storage.type === 'supabase') {
                        const supabaseId = storage.metadata?.supabaseId as string;
                        if (!supabaseId) throw new Error('Supabase Reference ID is missing in metadata');

                        // Implementation: Fetch DB connection info from Supabase Management API
                        const res = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}/config/database`, {
                            headers: { 'Authorization': `Bearer ${providerApiKey}` }
                        });

                        if (!res.ok) {
                            const errorText = await res.text();
                            throw new Error(`Supabase API error: ${errorText}`);
                        }

                        const data = await res.json();
                        // Note: Supabase Management API returns host, port, etc.
                        // We construct the connection string using the standard pattern.
                        newConnectionString = `postgresql://postgres:${data.password || 'password'}@db.${supabaseId}.supabase.co:5432/postgres`;
                    } else if (storage.type === 'mongodb-atlas') {
                        const groupId = storage.metadata?.groupId as string;
                        const clusterName = storage.metadata?.clusterName as string;

                        // Enhanced Metadata Validation
                        if (!groupId) throw new Error('MongoDB Atlas Group ID (Project ID) is missing in connector metadata');
                        if (!clusterName) throw new Error('MongoDB Atlas Cluster Name is missing in connector metadata');

                        // Implementation: Fetch Cluster info from Atlas Administration API
                        console.log(`Syncing MongoDB Atlas cluster: ${clusterName} in group: ${groupId}`);
                        const res = await fetch(`https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${clusterName}`, {
                            headers: {
                                'Authorization': `Bearer ${providerApiKey}`,
                                'Accept': 'application/json'
                            }
                        });

                        if (!res.ok) {
                            const errorText = await res.text();
                            const statusCode = res.status;
                            console.error(`Atlas API error [${statusCode}]: ${errorText}`);
                            throw new Error(`MongoDB Atlas API error (${statusCode}): ${errorText || 'Failed to fetch cluster details'}`);
                        }

                        const data = await res.json();
                        newConnectionString = data.connectionStrings?.standardSrv || `mongodb+srv://user:password@${clusterName}.mongodb.net/test`;
                    } else if (storage.type === 'planetscale') {
                        const organization = storage.metadata?.organization as string;
                        const database = storage.metadata?.database as string;
                        if (!organization || !database) throw new Error('PlanetScale Organization or Database name is missing');

                        // Implementation: Fetch Passwords from PlanetScale API
                        const res = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords`, {
                            headers: { 'Authorization': `Bearer ${providerApiKey}` }
                        });

                        if (!res.ok) {
                            const errorText = await res.text();
                            throw new Error(`PlanetScale API error: ${errorText}`);
                        }

                        const data = await res.json();
                        // Find the first active password to construct connection string
                        const activePwd = data.data?.[0];
                        if (activePwd) {
                            newConnectionString = `mysql://${activePwd.username}:${activePwd.access_host}/${database}?ssl={"rejectUnauthorized":true}`;
                        } else {
                            throw new Error('No active database passwords found in PlanetScale');
                        }
                    }
                }

                if (newConnectionString && storage.connectionStringSecretId) {
                    const { upsertSecret } = await import('@/lib/gcp/secrets');
                    await upsertSecret(`deployify-${id}-${storageId}-conn`, newConnectionString);
                }

                storage.lastSyncedAt = now;
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
            } else if (storage.type === 'cloud-spanner') {
                statusResult = await getSpannerOperationStatus(operationName);
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

            // Sync Replicas for Cloud SQL
            if (isCloudSql && storage.replicas && storage.replicas.length > 0) {
                try {
                    let replicaChanged = false;

                    for (const replica of storage.replicas) {
                        if (replica.status === 'provisioning' && storage.metadata?.lastReplicaOperation) {
                            const repStatus = await getCloudSqlOperationStatus(storage.metadata.lastReplicaOperation as string);
                            if (repStatus.status === 'DONE') {
                                replica.status = 'active';
                                replicaChanged = true;
                            }
                        }
                    }

                    if (replicaChanged) {
                        storageConfigs[index] = storage;
                        await updateProject(id, { storageConfigs });
                    }
                } catch (e) {
                    console.error('Failed to sync replica status:', e);
                }
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
            message: 'Operation still in progress'
        });

    } catch (error) {
        console.error('Storage sync error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error during sync' }, { status: 500 });
    }
}
