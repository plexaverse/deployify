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
        const targetGcpProjectId = gcpProjectId || access.project.id;

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
