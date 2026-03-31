import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { listBackups, createBackup } from '@/lib/gcp/cloudsql';
import type { StorageConfig } from '@/types';

/**
 * List or trigger backups for a storage connector
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
            storageConfig = { id: 'mock-storage-id', type: 'cloud-sql-postgres', name: 'MOCK STORAGE', metadata: { provisioned: true } } as StorageConfig;
        } else {
            const access = await checkProjectAccess(session.user.id, id);
            if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
            storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        }

        if (!storageConfig) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storageConfig.type.includes('cloud-sql')) {
            return NextResponse.json({ success: false, error: 'Backups are only supported for Cloud SQL instances' }, { status: 400 });
        }

        const instanceName = storageConfig.metadata?.instanceName as string || storageConfig.name;
        const backups = await listBackups(instanceName);

        return NextResponse.json({ success: true, backups });
    } catch (error) {
        console.error('Failed to list backups:', error);
        return NextResponse.json({ success: false, error: 'Failed to list backups' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const body = await request.json();
        const { description } = body;

        const session = await getSession();
        if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        let storageConfig: StorageConfig | undefined;

        if (process.env.MOCK_DB === 'true' && id === 'audit-id') {
            storageConfig = { id: 'mock-storage-id', type: 'cloud-sql-postgres', name: 'MOCK STORAGE', metadata: { provisioned: true } } as StorageConfig;
        } else {
            const access = await checkProjectAccess(session.user.id, id);
            if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
            storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        }

        if (!storageConfig) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storageConfig.type.includes('cloud-sql')) {
            return NextResponse.json({ success: false, error: 'Backups are only supported for Cloud SQL instances' }, { status: 400 });
        }

        const instanceName = storageConfig.metadata?.instanceName as string || storageConfig.name;
        const operationName = await createBackup(instanceName, description);

        return NextResponse.json({ success: true, operationName });
    } catch (error) {
        console.error('Failed to create backup:', error);
        return NextResponse.json({ success: false, error: 'Failed to create backup' }, { status: 500 });
    }
}
