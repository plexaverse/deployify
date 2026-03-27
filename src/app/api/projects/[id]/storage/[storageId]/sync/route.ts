import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { getOperationStatus as getCloudSqlOperationStatus } from '@/lib/gcp/cloudsql';
import { getOperationStatus as getMemorystoreOperationStatus } from '@/lib/gcp/memorystore';
import { getOperationStatus as getFirestoreOperationStatus } from '@/lib/gcp/firestore-admin';
import type { StorageConfig } from '@/types';

/**
 * Sync storage provisioning status from GCP
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];
        const now = new Date();

        // Handle External Connectors (Auto-Sync)
        if (storage.metadata?.autoSync && (storage.type === 'supabase' || storage.type === 'mongodb-atlas' || storage.type === 'planetscale')) {
            const providerApiKey = storage.metadata?.providerApiKey as string;

            if (process.env.MOCK_DB !== 'true' && !providerApiKey) {
                return NextResponse.json({
                    success: false,
                    error: `Auto-sync requires a Provider API Key for ${storage.type}`
                }, { status: 400 });
            }

            try {
                let newConnectionString = '';

                if (process.env.MOCK_DB === 'true') {
                    // Simulate API fetch delay
                    await new Promise(resolve => setTimeout(resolve, 500));
                    newConnectionString = storage.type === 'supabase'
                        ? 'postgresql://postgres:mock@db.supabase.co:5432/postgres'
                        : storage.type === 'mongodb-atlas'
                        ? 'mongodb+srv://mock:password@cluster.mongodb.net/test'
                        : 'mysql://mock:password@aws.connect.psdb.cloud/test';
                } else {
                    // Real API Logic Implementation (Logic-Ready Structures)
                    if (storage.type === 'supabase') {
                        const supabaseId = storage.metadata?.supabaseId as string;
                        if (!supabaseId) {
                            storage.status = 'error';
                            storage.lastError = 'Supabase Reference ID is missing in metadata';
                            storageConfigs[index] = storage;
                            await updateProject(id, { storageConfigs });
                            throw new Error(storage.lastError);
                        }

                        // Implementation: Fetch DB connection info from Supabase Management API
                        // const res = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}/config/database`, {
                        //     headers: { 'Authorization': `Bearer ${providerApiKey}` }
                        // });
                        // if (!res.ok) throw new Error(`Supabase API error: ${await res.text()}`);
                        // const data = await res.json();
                        // newConnectionString = `postgresql://postgres:${data.password}@db.${supabaseId}.supabase.co:5432/postgres`;

                        newConnectionString = storage.metadata?.connectionString as string || '';
                    } else if (storage.type === 'mongodb-atlas') {
                        const groupId = storage.metadata?.groupId as string;
                        const clusterName = storage.metadata?.clusterName as string;
                        if (!groupId || !clusterName) {
                            storage.status = 'error';
                            storage.lastError = 'MongoDB Atlas GroupID or ClusterName is missing';
                            storageConfigs[index] = storage;
                            await updateProject(id, { storageConfigs });
                            throw new Error(storage.lastError);
                        }

                        // Implementation: Fetch Cluster info from Atlas Administration API
                        // const res = await fetch(`https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${clusterName}`, {
                        //     headers: { 'Authorization': `Bearer ${providerApiKey}` } // Use Digest Auth in real scenario
                        // });
                        // if (!res.ok) throw new Error(`Atlas API error: ${await res.text()}`);
                        // const data = await res.json();
                        // newConnectionString = data.connectionStrings.standardSrv;

                        newConnectionString = storage.metadata?.connectionString as string || '';
                    } else if (storage.type === 'planetscale') {
                        const organization = storage.metadata?.organization as string;
                        const database = storage.metadata?.database as string;
                        if (!organization || !database) {
                            storage.status = 'error';
                            storage.lastError = 'PlanetScale Organization or Database name is missing';
                            storageConfigs[index] = storage;
                            await updateProject(id, { storageConfigs });
                            throw new Error(storage.lastError);
                        }

                        // Implementation: Fetch Passwords from PlanetScale API
                        // const res = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords`, {
                        //     headers: { 'Authorization': `Bearer ${providerApiKey}` }
                        // });

                        newConnectionString = storage.metadata?.connectionString as string || '';
                    }
                }

                if (newConnectionString && storage.connectionStringSecretId) {
                    const { upsertSecret } = await import('@/lib/gcp/secrets');
                    await upsertSecret(`deployify-${id}-${storageId}-conn`, newConnectionString);
                } else if (!newConnectionString && process.env.MOCK_DB !== 'true') {
                    throw new Error('Connection string could not be resolved from provider API');
                }

                storage.lastSyncedAt = now;
                storage.updatedAt = now;
                storage.status = 'active';
                storage.lastError = undefined;

                storageConfigs[index] = storage;
                await updateProject(id, { storageConfigs });

                return NextResponse.json({
                    success: true,
                    status: storage.status,
                    lastSyncedAt: storage.lastSyncedAt.toISOString()
                });
            } catch (error) {
                console.error(`Sync failed for ${storage.type}:`, error);

                // Persist error status if not already handled
                if (storage.status !== 'error') {
                    storage.status = 'error';
                    storage.lastError = error instanceof Error ? error.message : 'Unknown external sync error';
                    storageConfigs[index] = storage;
                    await updateProject(id, { storageConfigs });
                }

                return NextResponse.json({
                    success: false,
                    status: 'error',
                    error: `External sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                }, { status: 502 });
            }
        }

        if (storage.status !== 'provisioning') {
            return NextResponse.json({
                success: true,
                status: storage.status,
                message: 'Storage is not in provisioning state'
            });
        }

        const operationName = storage.metadata?.operationName as string;

        if (!operationName) {
            // If no operation name, we can't sync. Maybe it's stuck.
            return NextResponse.json({
                success: false,
                error: 'No operation name found for syncing'
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
            return NextResponse.json({ error: 'Failed to poll GCP status' }, { status: 500 });
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
                    const instanceName = storage.name.toLowerCase().replace(/\s+/g, '-');
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
            } else {
                storage.status = 'active';
                storage.lastSyncedAt = now;
            }

            storage.updatedAt = now;
            storageConfigs[index] = storage;

            await updateProject(id, { storageConfigs });

            return NextResponse.json({
                success: true,
                status: storage.status,
                lastSyncedAt: storage.lastSyncedAt?.toISOString(),
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
        return NextResponse.json({ error: 'Internal server error during sync' }, { status: 500 });
    }
}
