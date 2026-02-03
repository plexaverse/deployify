import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getProjectById, getDeploymentById } from '@/lib/db';
import { securityHeaders } from '@/lib/security';
import { getBuildLogsContent } from '@/lib/gcp/cloudbuild';
import { isRunningOnGCP } from '@/lib/gcp/auth';

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

        let logs = await getBuildLogsContent(deployment.cloudBuildId, project.region);

        if (!logs) {
            // If logs are not found, check if we are in local development
            if (!isRunningOnGCP()) {
                logs = `[LOCAL DEV MODE]\n\nBuild logs are not available because this is a simulated deployment.\n\nTo view real Cloud Build logs:\n1. Deploy this application to Google Cloud Run\n2. Configure the required environment variables\n\nSimulation Steps:\n[+] Building Docker image...\n[+] Pushing to Artifact Registry...\n[+] Deploying to Cloud Run...\n[+] Done!`;
            } else {
                // If logs are not found, it might be because the build is too old or failed early.
                return NextResponse.json({ error: 'Logs not found' }, { status: 404, headers: securityHeaders });
            }
        }

        return NextResponse.json({ logs }, { status: 200, headers: securityHeaders });

    } catch (error) {
        console.error('Error fetching logs:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: securityHeaders });
    }
}
