import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { cloneStorageConfig } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';

/**
 * POST - Clone a storage configuration
 */
export async function POST(
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

        if (access.role === 'viewer') {
            return NextResponse.json({ error: 'Forbidden: Viewers cannot manage storage' }, { status: 403 });
        }

        const body = await request.json();
        const { overrides = {} } = body;

        const clonedConfig = await cloneStorageConfig(id, storageId, overrides);

        if (!clonedConfig) {
            return NextResponse.json({ error: 'Failed to clone storage configuration' }, { status: 500 });
        }

        // Orchestrate "Clone with Data" sequential workflow if requested
        if (overrides.includeData) {
            try {
                const project = access.project;
                const sourceConfig = project.storageConfigs?.find(s => s.id === storageId);

                if (sourceConfig && (sourceConfig.type.includes('cloud-sql') || sourceConfig.type === 'memorystore-redis' || sourceConfig.type === 'firestore')) {
                    const timestamp = Date.now();
                    const bucketName = `deployify-portability-${id}`;
                    const extension = sourceConfig.type === 'memorystore-redis' ? '.rdb' :
                                     sourceConfig.type === 'firestore' ? '' : '.sql';
                    const gcsUri = `gs://${bucketName}/clones/${storageId}-to-${clonedConfig.id}-${timestamp}${extension}`;

                    let operationName;
                    let lastOperation: string = 'clone_export';
                    let newResourceName: string | undefined;
                    let newConnectionString: string | undefined;

                    // Step 1: Check if we need to provision a new resource for the clone
                    if (sourceConfig.metadata?.provisioned) {
                        const targetRegion = (sourceConfig.region || sourceConfig.metadata?.region as string || project.region || 'us-central1');
                        newResourceName = clonedConfig.name.toLowerCase().replace(/\s+/g, '-');

                        // Check for name collision in the same project
                        if (newResourceName === sourceConfig.metadata?.resourceName) {
                            newResourceName = `${newResourceName}-clone`;
                        }

                        if (sourceConfig.type.includes('cloud-sql')) {
                            const { createInstance } = await import('@/lib/gcp/cloudsql');
                            const provisionResult = await createInstance(newResourceName, sourceConfig.type.includes('postgres') ? 'postgres' : 'mysql', targetRegion, {
                                highAvailability: !!sourceConfig.metadata?.highAvailability,
                                pitrEnabled: !!sourceConfig.metadata?.pitrEnabled,
                                tier: sourceConfig.metadata?.tier as string
                            });
                            operationName = provisionResult.operationName;
                            newConnectionString = provisionResult.connectionString;
                        } else if (sourceConfig.type === 'memorystore-redis') {
                            const { createInstance } = await import('@/lib/gcp/memorystore');
                            const provisionResult = await createInstance(newResourceName, targetRegion, { ssl: !!sourceConfig.ssl });
                            operationName = provisionResult.operationName;
                            newConnectionString = provisionResult.connectionString;
                        } else if (sourceConfig.type === 'firestore') {
                            const { createDatabase } = await import('@/lib/gcp/firestore-admin');
                            const provisionResult = await createDatabase(newResourceName, targetRegion);
                            operationName = provisionResult.operationName;
                            newConnectionString = provisionResult.connectionString;
                        }

                        if (operationName) {
                            lastOperation = 'clone_provision';
                        }
                    }

                    // Step 2: If not provisioning (not managed), jump straight to Export
                    if (!operationName) {
                        const sourceResourceName = (sourceConfig.metadata?.resourceName as string) || sourceConfig.name.toLowerCase().replace(/\s+/g, '-');

                        if (sourceConfig.type.includes('cloud-sql')) {
                            const { exportInstance } = await import('@/lib/gcp/cloudsql');
                            operationName = await exportInstance(sourceResourceName, gcsUri);
                        } else if (sourceConfig.type === 'memorystore-redis') {
                            const { exportInstance } = await import('@/lib/gcp/memorystore');
                            operationName = await exportInstance(
                                sourceResourceName,
                                (sourceConfig.metadata?.region as string) || project.region || 'us-central1',
                                gcsUri
                            );
                        } else if (sourceConfig.type === 'firestore') {
                            const { exportDocuments } = await import('@/lib/gcp/firestore-admin');
                            operationName = await exportDocuments(
                                (sourceConfig.metadata?.resourceName as string) || '(default)',
                                gcsUri
                            );
                        }
                        lastOperation = 'clone_export';
                    }

                    if (operationName) {
                        // Update the clone with the operation tracking and any new resource info
                        const { updateProject } = await import('@/lib/db');
                        const { upsertSecret } = await import('@/lib/gcp/secrets');

                        let connectionStringSecretId = clonedConfig.connectionStringSecretId;
                        if (newConnectionString) {
                            const secretId = `deployify-${id}-${clonedConfig.id}-conn`;
                            connectionStringSecretId = await upsertSecret(secretId, newConnectionString);
                        }

                        const updatedConfigs = (project.storageConfigs || []).map(c =>
                            c.id === clonedConfig.id ? {
                                ...c,
                                status: 'provisioning',
                                connectionStringSecretId,
                                metadata: {
                                    ...c.metadata,
                                    operationName,
                                    lastOperation,
                                    portabilityUri: gcsUri,
                                    sourceStorageId: storageId,
                                    resourceName: newResourceName || c.metadata?.resourceName
                                }
                            } : c
                        );
                        await updateProject(id, { storageConfigs: updatedConfigs });
                    }
                }
            } catch (e) {
                console.error(`[CloneData] Orchestration failed:`, e);
                // We don't fail the clone itself, but the status will remain provisioning
            }
        }

        await logAuditEvent(
            access.project.teamId || null,
            session.user.id,
            'storage.cloned',
            {
                projectId: id,
                sourceStorageId: storageId,
                clonedStorageId: clonedConfig.id,
                clonedStorageName: clonedConfig.name
            }
        );

        return NextResponse.json({
            success: true,
            storageConfig: clonedConfig
        });
    } catch (error) {
        console.error('Failed to clone storage config:', error);
        return NextResponse.json({
            error: 'Failed to clone storage configuration',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
