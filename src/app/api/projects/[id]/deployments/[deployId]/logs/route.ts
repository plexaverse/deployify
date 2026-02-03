import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getProjectById, getDeploymentById } from '@/lib/db';
import { securityHeaders } from '@/lib/security';
import { getBuildLogsContent } from '@/lib/gcp/cloudbuild';

interface RouteParams {
    params: Promise<{ id: string; deployId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id, deployId } = await params;

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: securityHeaders });
        }

        const project = await getProjectById(id);
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: securityHeaders });
        }

        if (project.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: securityHeaders });
        }

        const deployment = await getDeploymentById(deployId);
        if (!deployment || deployment.projectId !== id) {
             return NextResponse.json({ error: 'Deployment not found' }, { status: 404, headers: securityHeaders });
        }

        if (!deployment.cloudBuildId) {
             return NextResponse.json({ error: 'No build ID for this deployment' }, { status: 400, headers: securityHeaders });
        }

        const logs = await getBuildLogsContent(deployment.cloudBuildId, project.region);

        if (!logs) {
            // If logs are not found, it might be because the build is too old or failed early.
            // Or running locally.
            return NextResponse.json({ error: 'Logs not found' }, { status: 404, headers: securityHeaders });
        }

        return NextResponse.json({ logs }, { status: 200, headers: securityHeaders });

    } catch (error) {
        console.error('Error fetching logs:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: securityHeaders });
    }
}
