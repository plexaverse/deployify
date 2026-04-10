import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { runRollback } from '@/lib/gcp/migrations';
import type { StorageConfig } from '@/types';
import { getProjectById } from '@/lib/db';

/**
 * Trigger a migration rollback for a storage connector
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const body = await request.json();
        const { command = 'prisma migrate resolve --rolled-back' } = body;

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

        const project = await getProjectById(id);
        if (!project) return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });

        let connectionString = '';
        if (storageConfig.connectionStringSecretId) {
            connectionString = await getSecretValue(storageConfig.connectionStringSecretId);
        }

        if (!connectionString && process.env.MOCK_DB !== 'true') {
            return NextResponse.json({ success: false, error: 'Connection string not configured' }, { status: 400 });
        }

        const commitSha = project.latestDeployment?.gitCommitSha || 'main';
        const envKey = storageConfig.envKey || 'DATABASE_URL';

        const { operationName } = await runRollback(
            id,
            project.repoFullName,
            commitSha,
            connectionString,
            envKey,
            command,
            project.region,
            project.rootDirectory
        );

        return NextResponse.json({ success: true, operationName });
    } catch (error) {
        console.error('Failed to trigger rollback:', error);
        return NextResponse.json({ success: false, error: 'Failed to trigger rollback' }, { status: 500 });
    }
}
