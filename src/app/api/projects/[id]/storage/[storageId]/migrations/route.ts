import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { discoverMigrations } from '@/lib/gcp/migrations';
import type { StorageConfig, Project } from '@/types';

/**
 * GET /api/projects/[id]/storage/[storageId]/migrations
 * Discover and list migrations for a SQL storage connector
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

        let project: Project | undefined;
        let storageConfig: StorageConfig | undefined;

        if (process.env.MOCK_DB === 'true' && id === 'audit-id') {
            project = {
                id: 'audit-id',
                repoFullName: 'owner/repo',
                githubToken: 'mock-token',
                storageConfigs: [{ id: storageId, type: 'cloud-sql-postgres', name: 'MOCK' } as StorageConfig]
            } as Project;
            storageConfig = project.storageConfigs?.[0];
        } else {
            const access = await checkProjectAccess(session.user.id, id);
            if (!access.allowed) {
                return NextResponse.json({ success: false, error: access.error }, { status: access.status });
            }
            project = access.project;
            storageConfig = project?.storageConfigs?.find(s => s.id === storageId);
        }

        if (!project || !storageConfig) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const discovery = await discoverMigrations(project, storageConfig);

        return NextResponse.json({
            success: true,
            type: discovery.type,
            migrations: discovery.migrations
        });
    } catch (error) {
        console.error('Failed to fetch migrations:', error);
        return NextResponse.json({ success: false, error: 'Failed to discover migrations' }, { status: 500 });
    }
}
