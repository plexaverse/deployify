import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { createReplica } from '@/lib/gcp/cloudsql';
import type { StorageConfig, StorageReplica } from '@/types';

/**
 * POST - Create a read replica for a Cloud SQL instance
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

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const storageIndex = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (storageIndex === -1) {
            return NextResponse.json({ error: 'Storage configuration not found' }, { status: 404 });
        }

        const storage = storageConfigs[storageIndex];
        const body = await request.json();
        const { name, region } = body;

        if (!name || !region) {
            return NextResponse.json({ error: 'Name and region are required' }, { status: 400 });
        }

        const masterInstanceName = storage.metadata?.resourceName as string;
        if (!masterInstanceName) {
            return NextResponse.json({ error: 'Master instance name not found in metadata' }, { status: 400 });
        }

        // Trigger replica creation
        const { operationName } = await createReplica(masterInstanceName, name, region);

        // Update project with new replica metadata
        const newReplica: StorageReplica = {
            id: `replica_${Date.now()}`,
            name,
            region,
            status: 'provisioning'
        };

        const updatedConfigs = [...storageConfigs];
        updatedConfigs[storageIndex] = {
            ...storage,
            replicas: [...(storage.replicas || []), newReplica],
            metadata: {
                ...storage.metadata,
                lastReplicaOperation: operationName
            }
        };

        await updateProject(id, { storageConfigs: updatedConfigs });

        return NextResponse.json({
            success: true,
            replica: newReplica,
            operationName
        });

    } catch (error) {
        console.error('Failed to create replica:', error);
        return NextResponse.json({ error: 'Failed to create replica' }, { status: 500 });
    }
}
