import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { terminateSession } from '@/lib/gcp/cloudsql';
import type { StorageConfig } from '@/types';

/**
 * Terminate a specific database session
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const { sessionId } = await request.json();

        if (!sessionId) {
            return NextResponse.json({ success: false, error: 'Session ID is required' }, { status: 400 });
        }

        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

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
            if (!access.allowed) {
                return NextResponse.json({ success: false, error: access.error }, { status: access.status });
            }
            storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        }

        if (!storageConfig) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storageConfig.type.includes('cloud-sql')) {
            return NextResponse.json({ success: false, error: 'Session management only supported for Cloud SQL' }, { status: 400 });
        }

        let connectionString = '';
        if (storageConfig.connectionStringSecretId) {
            connectionString = await getSecretValue(storageConfig.connectionStringSecretId);
        }

        if (!connectionString && process.env.MOCK_DB !== 'true') {
            return NextResponse.json({ success: false, error: 'Connection string not configured' }, { status: 400 });
        }

        const dbType = storageConfig.type.includes('postgres') ? 'postgres' : 'mysql';
        await terminateSession(connectionString, dbType, sessionId, {
            ssl: !!storageConfig.ssl,
            iamAuth: connectionString.includes('enable_iam_auth=true')
        });

        return NextResponse.json({
            success: true,
            message: `Session ${sessionId} terminated`
        });

    } catch (error) {
        console.error('Failed to terminate session:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to terminate session'
        }, { status: 500 });
    }
}
