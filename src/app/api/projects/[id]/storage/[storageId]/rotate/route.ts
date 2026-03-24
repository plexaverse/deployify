import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { upsertSecret } from '@/lib/gcp/secrets';
import { logAuditEvent } from '@/lib/audit';
import type { StorageConfig } from '@/types';

/**
 * Rotate credentials for a storage connector
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
            return NextResponse.json({ error: 'Forbidden: Viewers cannot rotate credentials' }, { status: 403 });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];
        const body = await request.json();
        const { connectionString } = body;

        if (!connectionString) {
            return NextResponse.json({ error: 'Connection string is required for rotation' }, { status: 400 });
        }

        // Update secret in Secret Manager
        const secretId = `deployify-${id}-${storageId}-conn`;
        const connectionStringSecretId = await upsertSecret(secretId, connectionString);

        // Update storage metadata
        storage.connectionStringSecretId = connectionStringSecretId;
        storage.updatedAt = new Date();
        storage.metadata = {
            ...(storage.metadata || {}),
            lastRotatedAt: new Date(),
        };

        storageConfigs[index] = storage;
        await updateProject(id, { storageConfigs });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'storage.credentials_rotated',
            {
                projectId: project.id,
                storageId: storageId,
                storageName: storage.name
            }
        );

        return NextResponse.json({
            success: true,
            message: 'Credentials rotated successfully',
            lastRotatedAt: storage.metadata.lastRotatedAt
        });

    } catch (error) {
        console.error('Storage rotation error:', error);
        return NextResponse.json({ error: 'Internal server error during credential rotation' }, { status: 500 });
    }
}
