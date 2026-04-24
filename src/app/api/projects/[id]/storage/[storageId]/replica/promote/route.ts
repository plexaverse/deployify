import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { promoteReplica } from '@/lib/gcp/cloudsql';
import { logAuditEvent } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';
import type { StorageConfig } from '@/types';

/**
 * Promote a read replica to a standalone instance
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
        const { replicaId } = await request.json();

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed || (access.role !== 'owner' && access.role !== 'admin')) {
            return NextResponse.json({
                success: false,
                error: !access.allowed ? access.error : 'Only owners and admins can promote replicas'
            }, { status: !access.allowed ? access.status : 403 });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const storage = storageConfigs.find((s: StorageConfig) => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const replicas = (storage.metadata?.replicas as Array<{ id: string, name: string, status: string }>) || [];
        const replica = replicas.find(r => r.id === replicaId);

        if (!replica) {
            return NextResponse.json({ success: false, error: 'Replica not found' }, { status: 404 });
        }

        const operationName = await promoteReplica(replica.name);

        // Update status to provisioning during promotion
        const updatedReplicas = replicas.map(r =>
            r.id === replicaId ? { ...r, status: 'provisioning', operationName } : r
        );

        storage.metadata = {
            ...storage.metadata,
            replicas: updatedReplicas
        };

        const updatedConfigs = storageConfigs.map(s => s.id === storageId ? storage : s);
        await updateProject(id, { storageConfigs: updatedConfigs });

        await logAuditEvent(
            project.teamId,
            session.user.id,
            'storage.replica.promoted',
            {
                projectId: id,
                storageId,
                replicaName: replica.name,
                operationName
            }
        );

        return NextResponse.json({
            success: true,
            message: 'Replica promotion started',
            operationName
        }, { headers: securityHeaders });

    } catch (error) {
        console.error('Failed to promote replica:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error'
        }, { status: 500 });
    }
}
