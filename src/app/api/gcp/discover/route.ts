import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { discoverResources } from '@/lib/gcp/discovery';

/**
 * GET - Discover database resources in a GCP project
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId'); // Deployify Project ID
        const gcpProjectId = searchParams.get('gcpProjectId'); // Optional: Target GCP Project ID

        if (!projectId) {
            return NextResponse.json({ error: 'Deployify Project ID is required' }, { status: 400 });
        }

        // 1. Verify user has access to the Deployify project
        const access = await checkProjectAccess(session.user.id, projectId);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        if (access.role === 'viewer') {
            return NextResponse.json({ error: 'Forbidden: Viewers cannot discover resources' }, { status: 403 });
        }

        // 2. Perform discovery (either for the project's default GCP project or an override)
        const targetGcpProjectId = gcpProjectId || undefined;

        // 3. Fetch active branch patterns to detect orphans
        const { listDeploymentsByProject } = await import('@/lib/db');
        const deployments = await listDeploymentsByProject(projectId, 100);
        const activePatterns = Array.from(new Set(
            deployments
                .filter(d => d.status === 'ready' || d.status === 'building')
                .map(d => d.pullRequestNumber ? `pr${d.pullRequestNumber}` : d.gitBranch.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase())
        ));

        const resources = await discoverResources(targetGcpProjectId, activePatterns);

        return NextResponse.json({
            success: true,
            resources
        });
    } catch (error) {
        console.error('Failed to discover GCP resources:', error);
        return NextResponse.json({
            error: 'Failed to discover resources',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * DELETE - Reclaim (delete) a discovered GCP resource
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');
        const resourceId = searchParams.get('resourceId');
        const resourceType = searchParams.get('resourceType');
        const region = searchParams.get('region');
        const gcpProjectId = searchParams.get('gcpProjectId');

        if (!projectId || !resourceId || !resourceType) {
            return NextResponse.json({ error: 'Project ID, Resource ID, and Resource Type are required' }, { status: 400 });
        }

        // 1. Verify user has access to the Deployify project
        const access = await checkProjectAccess(session.user.id, projectId);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        if (access.role !== 'owner' && access.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden: Only owners and admins can reclaim resources' }, { status: 403 });
        }

        // 2. Perform deletion based on type
        // Note: In discovery, resourceType is 'cloud-sql', 'firestore', or 'memorystore-redis'
        // which matches the DiscoveredResource interface.
        try {
            if (resourceType === 'cloud-sql') {
                const { deleteInstance } = await import('@/lib/gcp/cloudsql');
                await deleteInstance(resourceId, gcpProjectId || undefined);
            } else if (resourceType === 'memorystore-redis') {
                const { deleteInstance } = await import('@/lib/gcp/memorystore');
                if (!region) throw new Error('Region is required to delete Memorystore instances');
                await deleteInstance(resourceId, region, gcpProjectId || undefined);
            } else if (resourceType === 'firestore') {
                const { deleteDatabase } = await import('@/lib/gcp/firestore-admin');
                await deleteDatabase(resourceId, gcpProjectId || undefined);
            } else {
                return NextResponse.json({ error: `Unsupported resource type for reclamation: ${resourceType}` }, { status: 400 });
            }
        } catch (e) {
            console.error(`[Reclaim] Deletion failed for ${resourceId}:`, e);
            return NextResponse.json({
                error: `Failed to reclaim resource: ${e instanceof Error ? e.message : 'Unknown error'}`
            }, { status: 500 });
        }

        const { logAuditEvent } = await import('@/lib/audit');
        await logAuditEvent(
            access.project.teamId || null,
            session.user.id,
            'storage.resource_reclaimed',
            {
                projectId,
                resourceId,
                resourceType,
                gcpProjectId
            }
        );

        return NextResponse.json({
            success: true,
            message: `Resource ${resourceId} reclaimed successfully`
        });
    } catch (error) {
        console.error('Failed to reclaim resource:', error);
        return NextResponse.json({
            error: 'Failed to reclaim resource',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
