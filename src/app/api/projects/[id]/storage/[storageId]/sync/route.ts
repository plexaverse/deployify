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
                    // Real API Logic placeholders
                    if (storage.type === 'supabase') {
                        // Example: Fetch from Supabase Management API
                        // const res = await fetch(`https://api.supabase.com/v1/projects/${storage.metadata.supabaseId}/config/database`, { ... });
                    } else if (storage.type === 'mongodb-atlas') {
                        // Example: Fetch from Atlas Administration API
                    }
                    // For now, we keep the existing one if we can't fetch a new one
                    newConnectionString = storage.metadata?.connectionString as string || '';
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
                    lastSyncedAt: storage.lastSyncedAt.toISOString()
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
            } else {
                // Check if we need follow-up operations (e.g. create DB/User for Cloud SQL)
                const isCloudSql = storage.type.startsWith('cloud-sql');
                const hasCreatedDb = storage.metadata?.dbCreated;

                if (isCloudSql && !hasCreatedDb) {
                    try {
                        const { createDatabase, createUser } = await import('@/lib/gcp/cloudsql');
                        const instanceName = storage.name.toLowerCase().replace(/\s+/g, '-');
                        // Use project slug as default DB name for simplicity
                        const dbName = project.slug;

                        // Create database and default IAM user for connectivity
                        await createDatabase(instanceName, dbName);
                        await createUser(instanceName, 'deployify-sa');

                        storage.metadata = {
                            ...storage.metadata,
                            dbCreated: true,
                            defaultDb: dbName
                        };
                    } catch (e) {
                        console.error('Failed follow-up Cloud SQL provisioning:', e);
                        // We continue, as the instance is ready, but mark the error
                        storage.lastError = `Instance ready, but DB/User creation failed: ${e instanceof Error ? e.message : 'Unknown'}`;
                    }
                }

                storage.status = 'active';
                storage.lastSyncedAt = now; // Mark as synced when provisioning completes
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
