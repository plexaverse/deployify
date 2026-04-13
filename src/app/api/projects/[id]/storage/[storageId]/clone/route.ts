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

        // Orchestrate "Clone with Data" export job if requested
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
                    if (sourceConfig.type.includes('cloud-sql')) {
                        const { exportInstance } = await import('@/lib/gcp/cloudsql');
                        operationName = await exportInstance(
                            (sourceConfig.metadata?.resourceName as string) || sourceConfig.name.toLowerCase().replace(/\s+/g, '-'),
                            gcsUri
                        );
                    } else if (sourceConfig.type === 'memorystore-redis') {
                        const { exportInstance } = await import('@/lib/gcp/memorystore');
                        operationName = await exportInstance(
                            (sourceConfig.metadata?.resourceName as string) || sourceConfig.name.toLowerCase().replace(/\s+/g, '-'),
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

                    if (operationName) {
                        // Update the clone with the operation tracking
                        const { updateProject } = await import('@/lib/db');
                        const updatedConfigs = (project.storageConfigs || []).map(c =>
                            c.id === clonedConfig.id ? {
                                ...c,
                                metadata: {
                                    ...c.metadata,
                                    operationName,
                                    lastOperation: 'clone_export',
                                    portabilityUri: gcsUri
                                }
                            } : c
                        );
                        await updateProject(id, { storageConfigs: updatedConfigs });
                    }
                }
            } catch (e) {
                console.error(`[CloneData] Export orchestration failed:`, e);
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
