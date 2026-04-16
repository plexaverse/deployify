import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { migrateInstanceToRegion } from '@/lib/gcp/cloudsql';
import type { StorageConfig } from '@/types';

/**
 * POST - Trigger regional migration for a Cloud SQL instance
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
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];
        if (!storage.type.includes('cloud-sql')) {
            return NextResponse.json({ success: false, error: 'Regional migration is only supported for Cloud SQL' }, { status: 400 });
        }

        const targetRegion = project.region || 'us-central1';
        const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');

        const { operationName, targetInstanceName } = await migrateInstanceToRegion(resourceName, targetRegion);

        // Update storage state to provisioning
        storage.status = 'provisioning';
        storage.metadata = {
            ...storage.metadata,
            operationName,
            lastOperation: 'migrate_region',
            targetInstanceName,
            targetRegion
        };

        storageConfigs[index] = storage;
        await updateProject(id, { storageConfigs });

        return NextResponse.json({
            success: true,
            message: `Migration to ${targetRegion} started`,
            operationName,
            targetInstanceName
        });

    } catch (error) {
        console.error('Regional migration error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error during migration'
        }, { status: 500 });
    }
}
