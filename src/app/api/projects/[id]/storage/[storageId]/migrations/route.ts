import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { listMigrations, runMigration, getMigrationStatus } from '@/lib/gcp/migrations';
import type { StorageConfig } from '@/types';
import { getProjectById } from '@/lib/db';

/**
 * List applied migrations for a storage connector or get status of an active operation
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
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

        const searchParams = request.nextUrl.searchParams;
        const operationId = searchParams.get('operationId');

        if (operationId) {
            // Validate that the operationId (which is a build ID) belongs to this project
            // Cloud Build operation names are projects/{project}/locations/{location}/builds/{id}
            // We can also check tags or just verify access to the project first (done above)
            try {
                const status = await getMigrationStatus(operationId);
                return NextResponse.json({ success: true, ...status });
            } catch (error) {
                console.error('Failed to get migration status:', error);
                return NextResponse.json({ success: false, error: 'Failed to get migration status' }, { status: 500 });
            }
        }

        if (!storageConfig.type.includes('sql') && storageConfig.type !== 'planetscale') {
            return NextResponse.json({ success: false, error: 'Migrations are only supported for SQL-based storage' }, { status: 400 });
        }

        let connectionString = '';
        if (storageConfig.connectionStringSecretId) {
            connectionString = await getSecretValue(storageConfig.connectionStringSecretId);
        }

        if (!connectionString && process.env.MOCK_DB !== 'true') {
            return NextResponse.json({ success: false, error: 'Connection string not configured' }, { status: 400 });
        }

        const project = id === 'audit-id' ? { repoFullName: 'owner/repo', rootDirectory: '' } : await getProjectById(id);
        const repoDetails = (project && session.accessToken) ? {
            accessToken: session.accessToken,
            repoFullName: project.repoFullName,
            rootDirectory: project.rootDirectory
        } : undefined;

        const migrations = await listMigrations(connectionString, storageConfig.type, repoDetails);

        return NextResponse.json({ success: true, migrations });
    } catch (error) {
        console.error('Failed to list migrations:', error);
        return NextResponse.json({ success: false, error: 'Failed to list migrations' }, { status: 500 });
    }
}

/**
 * Trigger a migration for a storage connector
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const body = await request.json();
        const { command = 'prisma migrate deploy', takeBackup = false } = body;

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
        const envKey = storageConfig.envKey || (storageConfig.type === 'memorystore-redis' ? 'REDIS_URL' : 'DATABASE_URL');

        const { operationName } = await runMigration(
            id,
            project.repoFullName,
            commitSha,
            connectionString,
            envKey,
            command,
            project.region,
            project.rootDirectory,
            takeBackup
        );

        return NextResponse.json({ success: true, operationName });
    } catch (error) {
        console.error('Failed to trigger migration:', error);
        return NextResponse.json({ success: false, error: 'Failed to trigger migration' }, { status: 500 });
    }
}
