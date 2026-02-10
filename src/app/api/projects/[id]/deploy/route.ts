import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDeploymentById, createDeployment, updateDeployment, updateProject } from '@/lib/db';
import { checkProjectAccess } from '@/middleware/rbac';
import { checkUsageLimits } from '@/lib/billing/caps';
import { securityHeaders } from '@/lib/security';
import { getBranchLatestCommit } from '@/lib/github';
import { validateRepository } from '@/lib/github/validator';
import { parseRepoFullName } from '@/lib/utils';
import { config } from '@/lib/config';
import { generateCloudRunDeployConfig, submitCloudBuild, cancelBuild } from '@/lib/gcp/cloudbuild';
import { logAuditEvent } from '@/lib/audit';
import type { EnvVariable } from '@/types';
import { pollBuildStatus, simulateDeployment } from '@/lib/deployment';
import { sendWebhookNotification } from '@/lib/webhooks';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// Check if we're running on GCP
function isRunningOnGCP(): boolean {
    return process.env.K_SERVICE !== undefined || process.env.GOOGLE_CLOUD_PROJECT !== undefined;
}

// POST /api/projects/[id]/deploy - Trigger manual deployment
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        // Check project access
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status, headers: securityHeaders }
            );
        }

        const { project, membership } = access;

        if (membership && membership.role === 'viewer') {
            return NextResponse.json(
                { error: 'Viewers cannot deploy projects' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Check usage limits
        const { withinLimits, limitType } = await checkUsageLimits(session.user.id);
        if (!withinLimits) {
            return NextResponse.json(
                { error: `Usage limit exceeded: ${limitType}. Please upgrade your plan.` },
                { status: 403, headers: securityHeaders }
            );
        }

        // Get latest commit info from GitHub
        const { owner, repo } = parseRepoFullName(project.repoFullName);

        // Run pre-flight checks
        const validation = await validateRepository(
            session.accessToken,
            owner,
            repo,
            project.framework,
            project.rootDirectory
        );

        if (!validation.valid) {
            return NextResponse.json(
                { error: validation.error || 'Repository validation failed' },
                { status: 400, headers: securityHeaders }
            );
        }

        let commitSha: string;
        let commitMessage: string;
        let commitAuthor: string;

        try {
            const latestCommit = await getBranchLatestCommit(
                session.accessToken,
                owner,
                repo,
                project.defaultBranch
            );
            commitSha = latestCommit.sha;
            commitMessage = latestCommit.message;
            commitAuthor = latestCommit.author;
        } catch (e) {
            console.error('Could not fetch latest commit:', e);
            return NextResponse.json(
                { error: 'Failed to fetch latest commit from GitHub. Please ensure you have access to this repository.' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Create deployment record
        const deployment = await createDeployment({
            projectId: project.id,
            type: 'production',
            status: 'queued',
            gitBranch: project.defaultBranch,
            gitCommitSha: commitSha,
            gitCommitMessage: commitMessage,
            gitCommitAuthor: commitAuthor,
        });

        // Log audit event
        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'deployment.created',
            {
                projectId: project.id,
                deploymentId: deployment.id,
                gitCommitSha: commitSha,
                gitBranch: project.defaultBranch
            },
            project.id
        );

        // Check if running on GCP - use real Cloud Build
        if (isRunningOnGCP()) {
            try {
                // Extract environment variables by target
                const envVars = project.envVariables || [];
                const buildEnvVars: Record<string, string> = {};
                const runtimeEnvVars: Record<string, string> = {};
                const envTarget = 'production'; // Manual deploy is production

                envVars.forEach((env: EnvVariable) => {
                    const envEnvironment = env.environment || 'all';
                    if (envEnvironment !== 'all' && envEnvironment !== envTarget) {
                        return;
                    }

                    if (env.target === 'build' || env.target === 'both') {
                        buildEnvVars[env.key] = env.value;
                    }
                    if (env.target === 'runtime' || env.target === 'both') {
                        runtimeEnvVars[env.key] = env.value;
                    }
                });

                // Generate Cloud Build config
                const buildConfig = generateCloudRunDeployConfig({
                    projectSlug: project.slug,
                    repoFullName: project.repoFullName,
                    branch: project.defaultBranch,
                    commitSha: commitSha,
                    buildEnvVars,
                    runtimeEnvVars,
                    gitToken: session?.accessToken ?? project.githubToken ?? undefined,
                    projectRegion: project.region, // Use project's selected region
                    framework: project.framework,
                    buildCommand: project.buildCommand,
                    installCommand: project.installCommand,
                    outputDirectory: project.outputDirectory,
                    buildTimeout: project.buildTimeout,
                    healthCheckPath: project.healthCheckPath,
                    resources: project.resources,
                });

                // Submit to Cloud Build with project region
                const { buildId, logUrl } = await submitCloudBuild(buildConfig, project.region);

                // Update deployment with build info
                await updateDeployment(deployment.id, {
                    status: 'building',
                    cloudBuildId: buildId,
                    buildLogs: [logUrl],
                });

                // Start polling for build status with project region
                pollBuildStatus(
                    deployment.id,
                    project.id,
                    project.slug,
                    buildId,
                    project.region,
                    project.webhookUrl,
                    project.name,
                    session.user.email,
                    project.emailNotifications,
                    undefined,
                    undefined,
                    undefined
                );

                return NextResponse.json(
                    {
                        deployment: { ...deployment, cloudBuildId: buildId, buildLogs: [logUrl] },
                        message: 'Cloud Build triggered successfully.',
                    },
                    { status: 201, headers: securityHeaders }
                );
            } catch (buildError) {
                console.error('Cloud Build error:', buildError);
                const errorMessage = buildError instanceof Error ? buildError.message : 'Cloud Build failed';
                await updateDeployment(deployment.id, {
                    status: 'error',
                    errorMessage: errorMessage,
                });

                if (project.webhookUrl) {
                    const message = `🚨 **Build Trigger Failed** for project **${project.name}**\n\nError: ${errorMessage}`;
                    await sendWebhookNotification(project.webhookUrl, {
                        content: message,
                        text: message,
                    });
                }

                return NextResponse.json(
                    {
                        deployment,
                        error: 'Failed to trigger Cloud Build',
                        message: buildError instanceof Error ? buildError.message : 'Unknown error',
                    },
                    { status: 500, headers: securityHeaders }
                );
            }
        } else {
            // Local development - use simulation
            simulateDeployment(
                deployment.id,
                project.id,
                project.slug,
                project.name,
                session.user.email,
                project.emailNotifications
            );

            return NextResponse.json(
                {
                    deployment,
                    message: 'Deployment simulation triggered (local dev mode). Deploy to Cloud Run for real builds.',
                },
                { status: 201, headers: securityHeaders }
            );
        }
    } catch (error) {
        console.error('Error triggering deployment:', error);
        return NextResponse.json(
            { error: 'Failed to trigger deployment' },
            { status: 500, headers: securityHeaders }
        );
    }
}

// DELETE /api/projects/[id]/deploy?deploymentId=... - Cancel deployment
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id } = await params;
        const deploymentId = request.nextUrl.searchParams.get('deploymentId');

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        if (!deploymentId) {
            return NextResponse.json(
                { error: 'Deployment ID required' },
                { status: 400, headers: securityHeaders }
            );
        }

        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status, headers: securityHeaders }
            );
        }

        const { project, membership } = access;

        if (membership && membership.role === 'viewer') {
            return NextResponse.json(
                { error: 'Viewers cannot cancel deployments' },
                { status: 403, headers: securityHeaders }
            );
        }

        const deployment = await getDeploymentById(deploymentId);
        if (!deployment || deployment.projectId !== id) {
            return NextResponse.json(
                { error: 'Deployment not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        if (deployment.status !== 'queued' && deployment.status !== 'building') {
            return NextResponse.json(
                { error: 'Cannot cancel completed deployment' },
                { status: 400, headers: securityHeaders }
            );
        }

        if (isRunningOnGCP() && deployment.cloudBuildId) {
            try {
                await cancelBuild(deployment.cloudBuildId, project.region);
            } catch (e) {
                console.error('Failed to cancel Cloud Build:', e);
                // Continue to update DB status even if Cloud Build cancel fails
            }
        }

        await updateDeployment(deploymentId, {
            status: 'cancelled',
            errorMessage: 'Cancelled by user'
        });

        return NextResponse.json(
            { success: true },
            { status: 200, headers: securityHeaders }
        );

    } catch (error) {
        console.error('Error cancelling deployment:', error);
        return NextResponse.json(
            { error: 'Failed to cancel deployment' },
            { status: 500, headers: securityHeaders }
        );
    }
}

