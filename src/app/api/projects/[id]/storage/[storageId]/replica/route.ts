import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { createReadReplica } from '@/lib/gcp/cloudsql';
import { logAuditEvent } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';
import type { StorageConfig } from '@/types';

/**
 * Trigger read replica creation for a Cloud SQL connector
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed || (access.role !== 'owner' && access.role !== 'admin')) {
            return NextResponse.json({
                success: false,
                error: !access.allowed ? access.error : 'Only owners and admins can create replicas'
            }, { status: !access.allowed ? access.status : 403 });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const storage = storageConfigs.find((s: StorageConfig) => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storage.type.includes('cloud-sql')) {
            return NextResponse.json({ success: false, error: 'Replicas are only supported for Cloud SQL' }, { status: 400 });
        }

        const masterInstanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
        const region = (storage.metadata?.region as string) || project.region || 'us-central1';
        const tier = (storage.metadata?.tier as string) || 'db-f1-micro';

        // Generate a unique name for the replica
        const replicaSuffix = Math.random().toString(36).substring(2, 6);
        const replicaInstanceName = `${masterInstanceName}-replica-${replicaSuffix}`;

        const operationName = await createReadReplica(masterInstanceName, replicaInstanceName, region, tier);

        // Update storage metadata to track the replica
        const replica = {
            id: `replica-${replicaSuffix}`,
            name: replicaInstanceName,
            status: 'provisioning',
            region,
            tier,
            operationName,
            createdAt: new Date().toISOString()
        };

        const replicas = (storage.metadata?.replicas as unknown[]) || [];
        storage.metadata = {
            ...storage.metadata,
            replicas: [...replicas, replica]
        };

        const updatedConfigs = storageConfigs.map(s => s.id === storageId ? storage : s);
        await updateProject(id, { storageConfigs: updatedConfigs });

        await logAuditEvent(
            project.teamId,
            session.user.id,
            'storage.replica.created',
            {
                projectId: id,
                storageId,
                masterInstance: masterInstanceName,
                replicaInstance: replicaInstanceName
            }
        );

        return NextResponse.json({
            success: true,
            message: 'Read replica creation started',
            replica
        }, { headers: securityHeaders });

    } catch (error) {
        console.error('Failed to create replica:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error'
        }, { status: 500 });
    }
}
