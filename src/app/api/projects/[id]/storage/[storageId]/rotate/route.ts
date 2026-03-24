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

        if (!connectionString) {
            return NextResponse.json({ error: 'New connection string is required' }, { status: 400 });
        }

        const storageConfigs = project.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];
        const secretId = `deployify-${id}-${storageId}-conn`;

        // Update Secret Manager
        const connectionStringSecretId = await upsertSecret(secretId, connectionString);

        // Update storage metadata
        const now = new Date();
        const updatedStorage: StorageConfig = {
            ...storage,
            connectionStringSecretId,
            lastRotatedAt: now,
            updatedAt: now,
        };

        storageConfigs[index] = updatedStorage;
        await updateProject(id, { storageConfigs });

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
            storageConfig: updatedStorage
        });

    } catch (error) {
        console.error('Credential rotation error:', error);
        return NextResponse.json({ error: 'Internal server error during credential rotation' }, { status: 500 });
    }
}
