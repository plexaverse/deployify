import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { getOperationStatus as getCloudSqlOperationStatus } from '@/lib/gcp/cloudsql';
import type { StorageConfig } from '@/types';

/**
 * Sync storage provisioning status from GCP
 */
export async function GET(
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
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];

        if (storage.status !== 'provisioning') {
            return NextResponse.json({
                success: true,
                status: storage.status,
                message: 'Storage is not in provisioning state'
            });
        }

        const operationName = storage.metadata?.operationName as string;

        if (!operationName) {
            // If no operation name, we can't sync. Maybe it's stuck.
            return NextResponse.json({
                success: false,
                error: 'No operation name found for syncing'
            }, { status: 400 });
        }

        // Poll GCP for status
        let statusResult;
        try {
            // For now, Cloud SQL and others share similar operation structures or we mock them
            statusResult = await getCloudSqlOperationStatus(operationName);
        } catch (error) {
            console.error('Failed to get operation status:', error);
            return NextResponse.json({ error: 'Failed to poll GCP status' }, { status: 500 });
        }

        if (statusResult.status === 'DONE') {
            if (statusResult.error) {
                storage.status = 'error';
                storage.lastError = statusResult.error;
            } else {
                storage.status = 'active';
            }

            storage.updatedAt = new Date();
            storageConfigs[index] = storage;

            await updateProject(id, { storageConfigs });

            return NextResponse.json({
                success: true,
                status: storage.status,
                error: storage.lastError
            });
        }

        return NextResponse.json({
            success: true,
            status: 'provisioning',
            message: 'Operation still in progress'
        });

    } catch (error) {
        console.error('Storage sync error:', error);
        return NextResponse.json({ error: 'Internal server error during sync' }, { status: 500 });
    }
}
