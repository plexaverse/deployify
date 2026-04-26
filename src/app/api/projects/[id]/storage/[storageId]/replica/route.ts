import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { createReadReplica, deleteInstance } from '@/lib/gcp/cloudsql';
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

        const isExternal = ['supabase', 'neon', 'mongodb-atlas', 'planetscale'].includes(storage.type);

        if (!storage.type.includes('cloud-sql') && !isExternal) {
            return NextResponse.json({ success: false, error: 'Replicas are only supported for Cloud SQL and Managed External connectors' }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));
        const replicaSuffix = Math.random().toString(36).substring(2, 6);
        let replica;
        let auditDetails: Record<string, unknown> = {
            projectId: id,
            storageId
        };

        if (storage.type.includes('cloud-sql')) {
            const masterInstanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
            const region = body.region || (storage.metadata?.region as string) || project.region || 'us-central1';
            const tier = body.tier || (storage.metadata?.tier as string) || 'db-f1-micro';
            const replicaInstanceName = `${masterInstanceName}-replica-${replicaSuffix}`;

            const operationName = await createReadReplica(masterInstanceName, replicaInstanceName, region, tier);

            replica = {
                id: `replica-${replicaSuffix}`,
                name: replicaInstanceName,
                status: 'provisioning',
                region,
                tier,
                operationName,
                createdAt: new Date().toISOString()
            };

            auditDetails = {
                ...auditDetails,
                masterInstance: masterInstanceName,
                replicaInstance: replicaInstanceName
            };
        } else {
            // External Replicas (developer provides connection string)
            const { connectionString, name, region } = body;
            if (!connectionString) {
                return NextResponse.json({ success: false, error: 'Connection string is required for external replicas' }, { status: 400 });
            }

            const replicaName = name || `${storage.name} REPLICA`;
            replica = {
                id: `replica-${replicaSuffix}`,
                name: replicaName,
                connectionString,
                status: 'active',
                region: region || storage.region || 'external',
                createdAt: new Date().toISOString()
            };

            auditDetails = {
                ...auditDetails,
                replicaName,
                external: true
            };
        }

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
            auditDetails
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

/**
 * Delete a specific read replica
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const { searchParams } = new URL(request.url);
        const replicaId = searchParams.get('replicaId');

        if (!replicaId) {
            return NextResponse.json({ success: false, error: 'Replica ID is required' }, { status: 400 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed || (access.role !== 'owner' && access.role !== 'admin')) {
            return NextResponse.json({
                success: false,
                error: !access.allowed ? access.error : 'Only owners and admins can delete replicas'
            }, { status: !access.allowed ? access.status : 403 });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const storage = storageConfigs.find((s: StorageConfig) => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const replicas = (storage.metadata?.replicas as Array<{ id: string, name: string }>) || [];
        const replica = replicas.find(r => r.id === replicaId);

        if (!replica) {
            return NextResponse.json({ success: false, error: 'Replica not found' }, { status: 404 });
        }

        // 1. Delete actual GCP resource
        await deleteInstance(replica.name, storage.providerProjectId);

        // 2. Remove from metadata
        const updatedReplicas = replicas.filter(r => r.id !== replicaId);
        storage.metadata = {
            ...storage.metadata,
            replicas: updatedReplicas
        };

        const updatedConfigs = storageConfigs.map(s => s.id === storageId ? storage : s);
        await updateProject(id, { storageConfigs: updatedConfigs });

        await logAuditEvent(
            project.teamId,
            session.user.id,
            'storage.replica.deleted',
            {
                projectId: id,
                storageId,
                replicaName: replica.name
            }
        );

        return NextResponse.json({
            success: true,
            message: 'Read replica deletion initiated'
        }, { headers: securityHeaders });

    } catch (error) {
        console.error('Failed to delete replica:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error'
        }, { status: 500 });
    }
}
