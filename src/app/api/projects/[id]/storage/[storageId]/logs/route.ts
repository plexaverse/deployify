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

        const searchParams = request.nextUrl.searchParams;
        const severity = searchParams.get('severity') || 'ALL';
        const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
        const pageToken = searchParams.get('pageToken') || undefined;

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
            return NextResponse.json({ success: false, error: 'Logs only supported for Cloud SQL instances' }, { status: 400 });
        }

        const instanceName = storageConfig.metadata?.resourceName as string || storageConfig.name.toLowerCase().replace(/\s+/g, '-');

        const { entries, nextPageToken } = await getDatabaseLogs(instanceName, {
            severity,
            pageSize,
            pageToken
        });

        return NextResponse.json({
            success: true,
            logs: entries,
            nextPageToken
        });

    } catch (error) {
        console.error('Failed to fetch database logs:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch database logs'
        }, { status: 500 });
    }
}
