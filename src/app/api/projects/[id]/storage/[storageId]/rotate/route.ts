import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateProject } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { checkProjectAccess } from '@/middleware/rbac';
import { upsertSecret } from '@/lib/gcp/secrets';
import type { StorageConfig } from '@/types';

/**
 * POST - Rotate credentials for a storage connector
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

        const { project } = access;
        const body = await request.json();
        const { connectionString } = body;

        const storageConfigs = project.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];
        const secretId = `deployify-${id}-${storageId}-conn`;
        const now = new Date();

        let finalConnectionString = connectionString;
        let connectionStringSecretId = storage.connectionStringSecretId;

        // Auto-Rotate via Provider API if supported and no manual string provided
        const isExternal = ['supabase', 'mongodb-atlas', 'planetscale', 'neon'].includes(storage.type);
        if (!finalConnectionString && isExternal && storage.metadata?.autoSync) {
            try {
                const { syncExternalConnector } = await import('@/lib/gcp/external-sync');
                const syncResult = await syncExternalConnector(id, storage);
                if (syncResult.success && syncResult.connectionString) {
                    finalConnectionString = syncResult.connectionString;
                } else {
                    throw new Error(syncResult.error || 'Provider API sync failed to return a connection string');
                }
            } catch (e) {
                console.error(`[AutoRotate] Sync failed for ${storage.name}:`, e);
                return NextResponse.json({
                    error: `Auto-rotation failed: ${e instanceof Error ? e.message : 'Unknown error'}`
                }, { status: 503 });
            }
        }

        if (!finalConnectionString) {
            return NextResponse.json({ error: 'New connection string is required for manual rotation' }, { status: 400 });
        }

        // Update Secret Manager
        connectionStringSecretId = await upsertSecret(secretId, finalConnectionString);

        // Update storage metadata
        const updatedStorage: StorageConfig = {
            ...storage,
            connectionStringSecretId,
            lastRotatedAt: now,
            updatedAt: now,
        };

        storageConfigs[index] = updatedStorage;
        await updateProject(id, { storageConfigs });

        // Trigger autonomous deployment refresh
        const { refreshProjectDeployments } = await import('@/lib/db');
        const refreshResult = await refreshProjectDeployments(id, storageId);

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'storage.rotated',
            {
                projectId: project.id,
                storageName: storage.name,
                storageId: storageId
            }
        );

        return NextResponse.json({
            success: true,
            lastRotatedAt: now.toISOString(),
            storageConfig: updatedStorage,
            refresh: refreshResult
        });

    } catch (error) {
        console.error('Credential rotation error:', error);
        return NextResponse.json({ error: 'Internal server error during credential rotation' }, { status: 500 });
    }
}
