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
        const { overrides } = body;

        const clonedConfig = await cloneStorageConfig(id, storageId, overrides);

        if (!clonedConfig) {
            return NextResponse.json({ error: 'Failed to clone storage configuration' }, { status: 500 });
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
