import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDatabaseLogs } from '@/lib/gcp/monitoring';
import type { StorageConfig } from '@/types';

/**
 * Fetch database engine logs
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const severity = searchParams.get('severity') || undefined;
        const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

        let storageConfig: StorageConfig | undefined;

        if (process.env.MOCK_DB === 'true' && id === 'audit-id') {
            storageConfig = {
                id: 'mock-storage-id',
                type: 'cloud-sql-postgres',
                name: 'MOCK STORAGE',
                status: 'active',
                environment: 'production',
                metadata: { provisioned: true, resourceName: 'mock-instance' },
                createdAt: new Date(),
                updatedAt: new Date()
            } as StorageConfig;
        } else {
            const access = await checkProjectAccess(session.user.id, id);
            if (!access.allowed) {
                return NextResponse.json({ success: false, error: access.error }, { status: access.status });
            }
            storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        }

        if (!storageConfig) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storageConfig.type.includes('cloud-sql')) {
            return NextResponse.json({ success: false, error: 'Log streaming only supported for Cloud SQL' }, { status: 400 });
        }

        const instanceId = (storageConfig.metadata?.resourceName as string) || storageConfig.name.toLowerCase().replace(/\s+/g, '-');
        const gcpProjectId = (storageConfig.metadata?.projectId as string) || (storageConfig.providerProjectId as string);

        const logs = await getDatabaseLogs(instanceId, {
            severity,
            pageSize,
            projectId: gcpProjectId
        });

        return NextResponse.json({
            success: true,
            logs
        });

    } catch (error) {
        console.error('Failed to fetch database logs:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch database logs'
        }, { status: 500 });
    }
}
