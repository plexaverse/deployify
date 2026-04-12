import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { exportInstance as exportCloudSql } from '@/lib/gcp/cloudsql';
import { exportDocuments } from '@/lib/gcp/firestore-admin';
import { exportInstance as exportRedis } from '@/lib/gcp/memorystore';
import { logAuditEvent } from '@/lib/audit';
import type { StorageConfig } from '@/types';

/**
 * POST - Trigger a full database export to GCS
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
            return NextResponse.json({ error: 'Forbidden: Viewers cannot export data' }, { status: 403 });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const storage = storageConfigs.find((s: StorageConfig) => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storage.type.includes('cloud-sql') && storage.type !== 'firestore' && storage.type !== 'memorystore-redis') {
            return NextResponse.json({ error: 'Exports are only supported for Cloud SQL, Firestore, and Memorystore instances' }, { status: 400 });
        }

        const body = await request.json();
        const { storageUri, databases, collections } = body;

        if (!storageUri || !storageUri.startsWith('gs://')) {
            return NextResponse.json({ error: 'Valid GCS URI (gs://bucket/path) is required' }, { status: 400 });
        }

        const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
        const region = (storage.region || storage.metadata?.region as string) || 'us-central1';

        // Trigger export based on type
        let operationName: string;
        if (storage.type === 'firestore') {
            operationName = await exportDocuments(resourceName, storageUri, collections || []);
        } else if (storage.type === 'memorystore-redis') {
            operationName = await exportRedis(resourceName, region, storageUri);
        } else {
            operationName = await exportCloudSql(resourceName, storageUri, databases || []);
        }

        // Update Storage status to provisioning while export is running
        storage.status = 'provisioning';
        storage.metadata = {
            ...storage.metadata,
            operationName,
            lastOperation: 'export'
        };
        storage.updatedAt = new Date();

        const { updateProject } = await import('@/lib/db');
        await updateProject(id, { storageConfigs });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'storage.export',
            {
                projectId: project.id,
                storageName: storage.name,
                storageId: storageId,
                destination: storageUri
            }
        );

        return NextResponse.json({
            success: true,
            operationName,
            message: 'Export operation started successfully'
        });

    } catch (error) {
        console.error('Storage export error:', error);
        return NextResponse.json({ error: 'Internal server error during export' }, { status: 500 });
    }
}
