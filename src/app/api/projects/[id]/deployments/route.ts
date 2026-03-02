import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listDeploymentsByProject } from '@/lib/db';
import { checkProjectAccess } from '@/middleware/rbac';
import { securityHeaders } from '@/lib/security';
import { syncDeploymentStatus } from '@/lib/deployment';
import { getProjectSlugForDeployment } from '@/lib/utils';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status, headers: securityHeaders }
            );
        }

        const { project } = access;

        const searchParams = request.nextUrl.searchParams;
        const limitParam = searchParams.get('limit');
        const limit = limitParam ? parseInt(limitParam, 10) : 100;

        const deployments = await listDeploymentsByProject(id, limit);

        // Sync status for active deployments to ensure data freshness
        // This handles cases where Cloud Run CPU throttling might pause background polling
        const activeDeployments = deployments.filter(d =>
            d.status === 'queued' || d.status === 'building' || d.status === 'deploying'
        );

        if (activeDeployments.length > 0) {
            const updatedDeployments = await Promise.all(activeDeployments.map(async (d) => {
                if (!d.cloudBuildId) return d;

                const projectSlug = getProjectSlugForDeployment(project, d);

                // Call sync logic
                const updated = await syncDeploymentStatus(
                    d.id,
                    project.id,
                    projectSlug,
                    d.cloudBuildId,
                    d.gitCommitSha,
                    project.region,
                    project.webhookUrl,
                    project.name,
                    session.user.email,
                    project.emailNotifications,
                    project.repoFullName,
                    d.pullRequestNumber,
                    session.accessToken
                );

                return updated || d;
            }));

            // Update the deployments list with fresh data
            updatedDeployments.forEach(updated => {
                 const index = deployments.findIndex(d => d.id === updated.id);
                 if (index !== -1) {
                     deployments[index] = updated;
                 }
            });
        }

        return NextResponse.json(
            { deployments },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error getting deployments:', error);
        return NextResponse.json(
            { error: 'Failed to get deployments' },
            { status: 500, headers: securityHeaders }
        );
    }
}
