import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDeploymentById, createDeployment } from '@/lib/db';
import { checkProjectAccess, hasRole } from '@/middleware/rbac';
import { securityHeaders } from '@/lib/security';
import { updateTraffic } from '@/lib/gcp/cloudrun';
import { getGcpAccessToken, isRunningOnGCP } from '@/lib/gcp/auth';

interface RouteParams {
    params: Promise<{ id: string; deployId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id, deployId } = await params;

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: securityHeaders });
        }

        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status, headers: securityHeaders });
        }

        if (!hasRole(access.membership?.role, 'member')) {
            return NextResponse.json({ error: 'Forbidden: Member access required' }, { status: 403, headers: securityHeaders });
        }

        const { project } = access;

        const targetDeployment = await getDeploymentById(deployId);
        if (!targetDeployment || targetDeployment.projectId !== id) {
             return NextResponse.json({ error: 'Deployment not found' }, { status: 404, headers: securityHeaders });
        }

        if (targetDeployment.status !== 'ready' || !targetDeployment.cloudRunRevision) {
             return NextResponse.json({ error: 'Cannot rollback to this deployment: missing revision or not ready' }, { status: 400, headers: securityHeaders });
        }

        // Perform rollback on GCP
        if (isRunningOnGCP()) {
            try {
                const accessToken = await getGcpAccessToken();
                const serviceName = `dfy-${project.slug}`.substring(0, 63);
                await updateTraffic(serviceName, targetDeployment.cloudRunRevision, accessToken, project.region);
            } catch (e) {
                console.error('Failed to update traffic:', e);
                return NextResponse.json({ error: 'Failed to perform rollback on Cloud Run' }, { status: 500, headers: securityHeaders });
            }
        } else {
            console.log('Simulating rollback traffic update...');
            // Wait a bit to simulate
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Create a new deployment record for history
        const rollbackDeployment = await createDeployment({
            projectId: project.id,
            type: 'production',
            status: 'ready', // Traffic switch is immediate
            gitBranch: targetDeployment.gitBranch,
            gitCommitSha: targetDeployment.gitCommitSha,
            gitCommitMessage: `Rollback to ${targetDeployment.gitCommitSha.substring(0, 7)}`,
            gitCommitAuthor: session.user.name || session.user.githubUsername, // User who triggered rollback
            cloudRunRevision: targetDeployment.cloudRunRevision,
            url: targetDeployment.url,
            readyAt: new Date(),
        });

        return NextResponse.json({ deployment: rollbackDeployment }, { status: 201, headers: securityHeaders });

    } catch (error) {
        console.error('Error rolling back:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: securityHeaders });
    }
}
