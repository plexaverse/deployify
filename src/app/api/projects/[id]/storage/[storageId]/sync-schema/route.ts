import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { syncSchema } from '@/lib/gcp/schema-sync';
import { config } from '@/lib/config';
import { updateProject } from '@/lib/db';
import type { StorageConfig } from '@/types';

/**
 * POST - Trigger schema and data synchronization from a source connector to this one
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const { sourceStorageId, gcsBucket } = await request.json();

        if (!sourceStorageId) {
            return NextResponse.json({ success: false, error: 'Missing sourceStorageId' }, { status: 400 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];

        const targetIndex = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);
        const sourceStorage = storageConfigs.find((s: StorageConfig) => s.id === sourceStorageId);

        if (targetIndex === -1 || !sourceStorage) {
            return NextResponse.json({ success: false, error: 'Source or Target storage connector not found' }, { status: 404 });
        }

        const targetStorage = { ...storageConfigs[targetIndex] };

        // Use provided bucket or default from config
        const bucket = gcsBucket || config.gcp.storageBucket || `deployify-sync-${id}`;

        const result = await syncSchema(sourceStorage, targetStorage, bucket);

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error || result.message
            }, { status: 400 });
        }

        // Update target storage to track sync orchestration
        targetStorage.status = 'provisioning';
        targetStorage.metadata = {
            ...targetStorage.metadata,
            operationName: result.operationName,
            lastOperation: 'sync_schema_export',
            syncSourceInstance: sourceStorage.metadata?.resourceName,
            syncStorageUri: result.storageUri,
            syncTargetDatabase: project.slug // Default target database
        };
        targetStorage.updatedAt = new Date();
        storageConfigs[targetIndex] = targetStorage;

        await updateProject(id, { storageConfigs });

        return NextResponse.json({
            success: true,
            message: result.message,
            operationName: result.operationName,
            storageConfig: targetStorage
        });

    } catch (error) {
        console.error('Schema Sync API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error during schema sync'
        }, { status: 500 });
    }
}
