import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { listBackups, createBackup, updateBackupPolicy } from '@/lib/gcp/cloudsql';
import { updateProject } from '@/lib/db';
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
            return NextResponse.json({ success: false, error: 'Backups are only supported for Cloud SQL instances' }, { status: 400 });
        }

        const instanceName = (storageConfig.metadata?.resourceName as string) || (storageConfig.metadata?.instanceName as string) || storageConfig.name.toLowerCase().replace(/\s+/g, '-');
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
            return NextResponse.json({ success: false, error: 'Backups are only supported for Cloud SQL instances' }, { status: 400 });
        }

        const instanceName = (storageConfig.metadata?.resourceName as string) || storageConfig.name.toLowerCase().replace(/\s+/g, '-');
        const operationName = await createBackup(instanceName, description);

        return NextResponse.json({ success: true, operationName });
    } catch (error) {
        console.error('Failed to create backup:', error);
        return NextResponse.json({ success: false, error: 'Failed to create backup' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const body = await request.json();
        const { retentionDays, transactionLogRetentionDays } = body;

        const session = await getSession();
        if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

        const storageConfigs = access.project?.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];
        if (!storage.type.includes('cloud-sql')) {
            return NextResponse.json({ success: false, error: 'Backup policies are only supported for Cloud SQL' }, { status: 400 });
        }

        const instanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
        const operationName = await updateBackupPolicy(instanceName, retentionDays, transactionLogRetentionDays);

        // Update metadata
        storage.metadata = {
            ...storage.metadata,
            backupRetentionDays: retentionDays,
            transactionLogRetentionDays: transactionLogRetentionDays || 7,
            operationName
        };
        storage.status = 'provisioning';
        storage.updatedAt = new Date();
        storageConfigs[index] = storage;

        await updateProject(id, { storageConfigs });

        return NextResponse.json({ success: true, operationName });
    } catch (error) {
        console.error('Failed to update backup policy:', error);
        return NextResponse.json({ success: false, error: 'Failed to update backup policy' }, { status: 500 });
    }
}
