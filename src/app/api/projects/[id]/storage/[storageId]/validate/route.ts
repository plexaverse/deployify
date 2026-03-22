import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateProject } from '@/lib/db';
import { checkProjectAccess } from '@/middleware/rbac';
import { validateConnection } from '@/lib/gcp/storage-validator';
import type { StorageConfig } from '@/types';

/**
 * POST - Trigger a health check/validation for a specific storage connector
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
        const storageIndex = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (storageIndex === -1) {
            return NextResponse.json({ error: 'Storage configuration not found' }, { status: 404 });
        }

        const storage = storageConfigs[storageIndex];

        // Perform connection validation
        const result = await validateConnection(
            storage.type,
            storage.connectionStringSecretId,
            storage.metadata
        );

        // Update status in project storage configs
        const newStatus = result.valid ? 'active' : 'error';
        const now = new Date();
        const updatedConfigs = [...storageConfigs];
        updatedConfigs[storageIndex] = {
            ...storage,
            status: newStatus,
            lastValidatedAt: now.toISOString() as any, // Typed as Date but serialized as string
            lastError: result.error,
            updatedAt: now,
        };

        // Persist the status update
        await updateProject(id, { storageConfigs: updatedConfigs });

        return NextResponse.json({
            success: true,
            valid: result.valid,
            error: result.error,
            latency: result.latency,
            status: newStatus,
            lastValidatedAt: now.toISOString()
        });
    } catch (error) {
        console.error('Failed to validate storage connection:', error);
        return NextResponse.json({
            error: 'Failed to validate storage connection',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
