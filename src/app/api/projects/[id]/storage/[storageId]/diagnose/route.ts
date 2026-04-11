import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { diagnoseConnection } from '@/lib/gcp/storage-validator';
import type { StorageConfig } from '@/types';

/**
 * POST - Trigger a deep diagnostic for a specific storage connector
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

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const storage = storageConfigs.find((s: StorageConfig) => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ error: 'Storage configuration not found' }, { status: 404 });
        }

        // Perform deep diagnostic
        const result = await diagnoseConnection(
            storage.type,
            storage.connectionStringSecretId,
            storage.metadata,
            { region: project.region }
        );

        return NextResponse.json({
            success: true,
            diagnostic: result
        });
    } catch (error) {
        console.error('Failed to diagnose storage connection:', error);
        return NextResponse.json({
            error: 'Failed to diagnose storage connection',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
