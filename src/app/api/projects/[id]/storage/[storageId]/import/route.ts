import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { importInstance as importCloudSql } from '@/lib/gcp/cloudsql';
import { importDocuments } from '@/lib/gcp/firestore-admin';
import { importInstance as importRedis } from '@/lib/gcp/memorystore';
import { logAuditEvent } from '@/lib/audit';
import type { StorageConfig } from '@/types';

/**
 * POST - Trigger a full database import from GCS
 */
export async function POST(
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

        if (access.role === 'viewer') {
            return NextResponse.json({ error: 'Forbidden: Viewers cannot import data' }, { status: 403 });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const storage = storageConfigs.find((s: StorageConfig) => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storage.type.includes('cloud-sql') && storage.type !== 'firestore' && storage.type !== 'memorystore-redis') {
            return NextResponse.json({ error: 'Imports are only supported for Cloud SQL, Firestore, and Memorystore instances' }, { status: 400 });
        }

        const body = await request.json();
        const { storageUri, database, importUser, collections } = body;

        if (!storageUri || !storageUri.startsWith('gs://')) {
            return NextResponse.json({ error: 'Valid GCS URI (gs://bucket/path) is required' }, { status: 400 });
        }

        if (!database && storage.type !== 'firestore' && storage.type !== 'memorystore-redis') {
            return NextResponse.json({ error: 'Target database name is required' }, { status: 400 });
        }

        const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
        const region = (storage.region || storage.metadata?.region as string) || 'us-central1';

        // Trigger import based on type
        let operationName: string;
        if (storage.type === 'firestore') {
            operationName = await importDocuments(resourceName, storageUri, collections || []);
        } else if (storage.type === 'memorystore-redis') {
            operationName = await importRedis(resourceName, region, storageUri);
        } else {
            operationName = await importCloudSql(resourceName, storageUri, database, importUser);
        }

        // Update Storage status to provisioning while import is running
        storage.status = 'provisioning';
        storage.metadata = {
            ...storage.metadata,
            operationName,
            lastOperation: 'import',
            importDb: database
        };
        storage.updatedAt = new Date();

        const { updateProject } = await import('@/lib/db');
        await updateProject(id, { storageConfigs });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'storage.import',
            {
                projectId: project.id,
                storageName: storage.name,
                storageId: storageId,
                source: storageUri,
                targetDatabase: database
            }
        );

        return NextResponse.json({
            success: true,
            operationName,
            message: 'Import operation started successfully'
        });

    } catch (error) {
        console.error('Storage import error:', error);
        return NextResponse.json({ error: 'Internal server error during import' }, { status: 500 });
    }
}
