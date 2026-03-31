import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { restoreBackup } from '@/lib/gcp/cloudsql';
import type { StorageConfig } from '@/types';

/**
 * Restore a storage instance from a backup
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string; backupId: string }> }
) {
    try {
        const { id, storageId, backupId } = await params;

        const session = await getSession();
        if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        let storageConfig: StorageConfig | undefined;

        if (process.env.MOCK_DB === 'true' && id === 'audit-id') {
            storageConfig = {
                id: 'mock-storage-id',
                type: 'cloud-sql-postgres',
                name: 'MOCK STORAGE',
                status: 'active',
                environment: 'production',
                metadata: { provisioned: true },
                createdAt: new Date(),
                updatedAt: new Date()
            } as StorageConfig;
        } else {
            const access = await checkProjectAccess(session.user.id, id);
            if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
            storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        }

        if (!storageConfig) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storageConfig.type.includes('cloud-sql')) {
            return NextResponse.json({ success: false, error: 'Restore is only supported for Cloud SQL instances' }, { status: 400 });
        }

        const instanceName = storageConfig.metadata?.instanceName as string || storageConfig.name;
        const operationName = await restoreBackup(instanceName, backupId);

        return NextResponse.json({ success: true, operationName });
    } catch (error) {
        console.error('Failed to restore backup:', error);
        return NextResponse.json({ success: false, error: 'Failed to restore backup' }, { status: 500 });
    }
}
