import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateProject } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { checkProjectAccess } from '@/middleware/rbac';
import { upsertSecret, deleteSecret } from '@/lib/gcp/secrets';
import { createInstance as createCloudSqlInstance, deleteInstance as deleteCloudSqlInstance, updateInstanceSettings as updateCloudSqlSettings } from '@/lib/gcp/cloudsql';
import { createInstance as createMemorystoreInstance, deleteInstance as deleteMemorystoreInstance, updateInstanceSize as updateMemorystoreSize } from '@/lib/gcp/memorystore';
import { createDatabase as createFirestoreDatabase, deleteDatabase as deleteFirestoreDatabase } from '@/lib/gcp/firestore-admin';
import type { StorageConfig } from '@/types';

// Generate unique ID for storage configs
function generateStorageId(): string {
    return `storage_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
}

// GET - List all storage configurations for a project
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];

        return NextResponse.json({ success: true, storageConfigs });
    } catch (error) {
        console.error('Failed to get storage configs:', error);
        return NextResponse.json({ error: 'Failed to get storage configurations' }, { status: 500 });
    }
}

// POST - Add a new storage configuration
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        if (access.role === 'viewer') {
            return NextResponse.json({ error: 'Forbidden: Viewers cannot manage storage' }, { status: 403 });
        }

        const { project } = access;
        const body = await request.json();
        const { type, name, environment = 'both', connectionString, envKey, metadata, branchingSettings, autoMigration, migrationCommand, provision = false, region } = body;

        // autoSync and secretOnly can be passed at top level or inside metadata
        const autoSync = body.autoSync || metadata?.autoSync || false;
        const secretOnly = body.secretOnly !== undefined ? body.secretOnly : (metadata?.secretOnly || false);

        if (!type || !name) {
            return NextResponse.json({ error: 'Type and name are required' }, { status: 400 });
        }

        const storageId = generateStorageId();
        let finalConnectionString = connectionString;
        let connectionStringSecretId: string | undefined;
        let status: StorageConfig['status'] = 'active';
        let operationName: string | undefined;
        let resourceName: string | undefined;

        /**
         * Standard Provisioning Flow
         */
        if (provision) {
            const targetRegion = region || project.region || 'us-central1';
            status = 'provisioning';
            resourceName = name.toLowerCase().replace(/\s+/g, '-');

            try {
                let provisionResult;
                if (type === 'cloud-sql-postgres' && resourceName) {
                    provisionResult = await createCloudSqlInstance(resourceName, 'postgres', targetRegion, {
                        highAvailability: metadata?.highAvailability,
                        pitrEnabled: metadata?.pitrEnabled,
                        tier: metadata?.tier
                    });
                    finalConnectionString = provisionResult.connectionString;
                } else if (type === 'cloud-sql-mysql' && resourceName) {
                    provisionResult = await createCloudSqlInstance(resourceName, 'mysql', targetRegion, {
                        highAvailability: metadata?.highAvailability,
                        pitrEnabled: metadata?.pitrEnabled,
                        tier: metadata?.tier
                    });
                    finalConnectionString = provisionResult.connectionString;
                } else if (type === 'memorystore-redis' && resourceName) {
                    provisionResult = await createMemorystoreInstance(resourceName, targetRegion);
                    finalConnectionString = provisionResult.connectionString;
                } else if (type === 'firestore' && resourceName) {
                    provisionResult = await createFirestoreDatabase(resourceName, targetRegion);
                    finalConnectionString = provisionResult.connectionString;
                }
                operationName = provisionResult?.operationName;
            } catch (error) {
                console.error('Provisioning failed:', error);
                return NextResponse.json({ error: `Provisioning failed: ${error instanceof Error ? error.message : 'Unknown error'}` }, { status: 500 });
            }
        }

        if (finalConnectionString) {
            // Store connection string in GCP Secret Manager
            const secretId = `deployify-${id}-${storageId}-conn`;
            connectionStringSecretId = await upsertSecret(secretId, finalConnectionString);
        }

        const newStorageConfig: StorageConfig = {
            id: storageId,
            type,
            name,
            status,
            environment,
            envKey,
            connectionStringSecretId,
            branchingSettings,
            autoMigration,
            migrationCommand,
            metadata: {
                ...(metadata || {}),
                provisioned: provision,
                autoSync,
                secretOnly,
                region: region || project.region || 'us-central1',
                operationName,
                resourceName,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const storageConfigs = project.storageConfigs || [];
        storageConfigs.push(newStorageConfig);

        await updateProject(id, { storageConfigs });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'storage.created',
            {
                projectId: project.id,
                storageName: name,
                storageType: type,
                storageId: newStorageConfig.id
            }
        );

        return NextResponse.json({
            success: true,
            storageConfig: newStorageConfig,
        });
    } catch (error) {
        console.error('Failed to add storage config:', error);
        return NextResponse.json({ error: 'Failed to add storage configuration' }, { status: 500 });
    }
}

// DELETE - Delete a storage configuration
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        if (access.role === 'viewer') {
            return NextResponse.json({ error: 'Forbidden: Viewers cannot manage storage' }, { status: 403 });
        }

        const { project } = access;
        const { searchParams } = new URL(request.url);
        const storageId = searchParams.get('storageId');
        const deleteResource = searchParams.get('deleteResource') === 'true';

        if (!storageId) {
            return NextResponse.json({ error: 'Storage ID is required' }, { status: 400 });
        }

        const storageConfigs = project.storageConfigs || [];
        const storageConfig = storageConfigs.find((s: StorageConfig) => s.id === storageId);

        if (!storageConfig) {
            return NextResponse.json({ error: 'Storage configuration not found' }, { status: 404 });
        }

        // 1. Delete actual GCP Resource if requested and provisioned
        if (deleteResource && storageConfig.metadata?.provisioned) {
            try {
                const resourceName = (storageConfig.metadata?.resourceName as string) || storageConfig.name.toLowerCase().replace(/\s+/g, '-');
                const region = (storageConfig.metadata?.region as string) || project.region || 'us-central1';

                if (storageConfig.type.includes('cloud-sql')) {
                    await deleteCloudSqlInstance(resourceName);
                } else if (storageConfig.type === 'memorystore-redis') {
                    await deleteMemorystoreInstance(resourceName, region);
                } else if (storageConfig.type === 'firestore') {
                    await deleteFirestoreDatabase(resourceName);
                }
            } catch (error) {
                console.error('Failed to delete GCP resource:', error);
                // We continue with local deletion even if resource deletion fails,
                // but we could also return an error if strictness is required.
            }
        }

        // 2. Delete from Secret Manager if applicable
        if (storageConfig.connectionStringSecretId) {
            const secretId = `deployify-${id}-${storageId}-conn`;
            await deleteSecret(secretId);
        }

        // 3. Remove from Project in Firestore
        const filteredConfigs = storageConfigs.filter((s: StorageConfig) => s.id !== storageId);
        await updateProject(id, { storageConfigs: filteredConfigs });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'storage.deleted',
            {
                projectId: project.id,
                storageId: storageId,
                storageName: storageConfig.name
            }
        );

        return NextResponse.json({ success: true, message: 'Storage configuration deleted' });
    } catch (error) {
        console.error('Failed to delete storage config:', error);
        return NextResponse.json({ error: 'Failed to delete storage configuration' }, { status: 500 });
    }
}

// PATCH - Update an existing storage configuration
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        if (access.role === 'viewer') {
            return NextResponse.json({ error: 'Forbidden: Viewers cannot manage storage' }, { status: 403 });
        }

        const { project } = access;
        const body = await request.json();
        const { storageId, type, name, environment, connectionString, envKey, metadata, branchingSettings, autoMigration, migrationCommand } = body;
        const secretOnly = body.secretOnly !== undefined ? body.secretOnly : metadata?.secretOnly;

        if (!storageId) {
            return NextResponse.json({ error: 'Storage ID is required' }, { status: 400 });
        }

        const storageConfigs = project.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ error: 'Storage configuration not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];
        let connectionStringSecretId = storage.connectionStringSecretId;
        let operationName = storage.metadata?.operationName;
        let status = storage.status;

        if (connectionString) {
            // Update connection string in GCP Secret Manager
            const secretId = `deployify-${id}-${storageId}-conn`;
            connectionStringSecretId = await upsertSecret(secretId, connectionString);
        }

        // Handle Scaling (GCP Resource Update)
        if (storage.metadata?.provisioned && metadata) {
            const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
            const region = (storage.metadata?.region as string) || project.region || 'us-central1';

            try {
                if (storage.type.includes('cloud-sql')) {
                    const hasTierChange = metadata.tier && metadata.tier !== storage.metadata?.tier;
                    const hasHAChange = metadata.highAvailability !== undefined && metadata.highAvailability !== storage.metadata?.highAvailability;
                    const hasPITRChange = metadata.pitrEnabled !== undefined && metadata.pitrEnabled !== storage.metadata?.pitrEnabled;

                    if (hasTierChange || hasHAChange || hasPITRChange) {
                        operationName = await updateCloudSqlSettings(resourceName, {
                            tier: metadata.tier,
                            highAvailability: metadata.highAvailability,
                            pitrEnabled: metadata.pitrEnabled
                        });
                        status = 'provisioning';
                    }
                } else if (storage.type === 'memorystore-redis' && metadata.memorySizeGb && metadata.memorySizeGb !== storage.metadata?.memorySizeGb) {
                    operationName = await updateMemorystoreSize(resourceName, region, metadata.memorySizeGb);
                    status = 'provisioning';
                }
            } catch (e) {
                console.error('Failed to trigger resource scaling:', e);
                // Continue with local metadata update, but log error
            }
        }

        const updatedStorageConfig: StorageConfig = {
            ...storage,
            type: type || storage.type,
            name: name || storage.name,
            status,
            environment: environment || storage.environment,
            envKey: envKey !== undefined ? envKey : storage.envKey,
            connectionStringSecretId,
            branchingSettings: branchingSettings || storage.branchingSettings,
            autoMigration: autoMigration !== undefined ? autoMigration : storage.autoMigration,
            migrationCommand: migrationCommand !== undefined ? migrationCommand : storage.migrationCommand,
            metadata: {
                ...(storage.metadata || {}),
                ...(metadata || {}),
                secretOnly: secretOnly !== undefined ? secretOnly : storage.metadata?.secretOnly,
                operationName
            },
            updatedAt: new Date(),
        };

        storageConfigs[index] = updatedStorageConfig;

        await updateProject(id, { storageConfigs });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'storage.updated',
            {
                projectId: project.id,
                storageName: updatedStorageConfig.name,
                storageId: storageId
            }
        );

        return NextResponse.json({
            success: true,
            storageConfig: updatedStorageConfig,
        });
    } catch (error) {
        console.error('Failed to update storage config:', error);
        return NextResponse.json({ error: 'Failed to update storage configuration' }, { status: 500 });
    }
}

// PATCH - Scale an existing storage configuration (internal helper for scaling logic)
// We extend the existing PATCH handler to also support scaling metadata updates.
