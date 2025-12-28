import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getProjectById, createDeployment, updateDeployment, updateProject } from '@/lib/db';
import { securityHeaders } from '@/lib/security';
import { getBranchLatestCommit } from '@/lib/github';
import { parseRepoFullName } from '@/lib/utils';
import { config } from '@/lib/config';
import { generateCloudRunDeployConfig, submitCloudBuild, getBuildStatus, mapBuildStatusToDeploymentStatus, getCloudRunServiceUrl } from '@/lib/gcp/cloudbuild';
import type { EnvVariable } from '@/types';

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

        // Get the project
        const project = await getProjectById(id);

        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        // Check ownership
        if (project.userId !== session.user.id) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Get latest commit info from GitHub
        const { owner, repo } = parseRepoFullName(project.repoFullName);
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

        // Check if running on GCP - use real Cloud Build
        if (isRunningOnGCP()) {
            try {
                // Extract environment variables by target
                const envVars = project.envVariables || [];
                const buildEnvVars: Record<string, string> = {};
                const runtimeEnvVars: Record<string, string> = {};

                envVars.forEach((env: EnvVariable) => {
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
                pollBuildStatus(deployment.id, project.id, project.slug, buildId, project.region);

                return NextResponse.json(
                    {
                        deployment: { ...deployment, cloudBuildId: buildId, buildLogs: [logUrl] },
                        message: 'Cloud Build triggered successfully.',
                    },
                    { status: 201, headers: securityHeaders }
                );
            } catch (buildError) {
                console.error('Cloud Build error:', buildError);
                await updateDeployment(deployment.id, {
                    status: 'error',
                    errorMessage: buildError instanceof Error ? buildError.message : 'Cloud Build failed',
                });

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
            simulateDeployment(deployment.id, project.id, project.slug);

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

// Poll Cloud Build status and update deployment
async function pollBuildStatus(deploymentId: string, projectId: string, projectSlug: string, buildId: string, projectRegion?: string | null) {
    const maxPolls = 60; // 30 minutes max (30s intervals)
    let pollCount = 0;

    // Determine effective region for URL construction
    const region = projectRegion || config.gcp.region;

    const poll = async () => {
        pollCount++;
        if (pollCount > maxPolls) {
            await updateDeployment(deploymentId, {
                status: 'error',
                errorMessage: 'Build timed out',
            });
            return;
        }

        try {
            const { status, finishTime } = await getBuildStatus(buildId, projectRegion);
            const deploymentStatus = mapBuildStatusToDeploymentStatus(status);

            if (status === 'SUCCESS') {
                // Build succeeded - get the service URL
                const serviceName = `dfy-${projectSlug}`.substring(0, 63);
                const serviceUrl = await getCloudRunServiceUrl(serviceName, projectRegion);

                await updateDeployment(deploymentId, {
                    status: 'ready',
                    url: serviceUrl || `https://${serviceName}-853384839522.${region}.run.app`,
                    readyAt: new Date(),
                });

                if (serviceUrl) {
                    await updateProject(projectId, {
                        productionUrl: serviceUrl,
                    });
                }
            } else if (status === 'FAILURE' || status === 'TIMEOUT' || status === 'CANCELLED') {
                await updateDeployment(deploymentId, {
                    status: deploymentStatus,
                    errorMessage: `Build ${status.toLowerCase()}`,
                });
            } else {
                // Still building - update status and continue polling
                await updateDeployment(deploymentId, {
                    status: deploymentStatus,
                });

                // Poll again in 30 seconds
                setTimeout(poll, 30000);
            }
        } catch (e) {
            console.error('Error polling build status:', e);
            // Continue polling on error
            setTimeout(poll, 30000);
        }
    };

    // Start polling after 10 seconds
    setTimeout(poll, 10000);
}

// Simulate deployment for local development
async function simulateDeployment(deploymentId: string, projectId: string, projectSlug: string) {
    // Phase 1: Building (after 2 seconds)
    setTimeout(async () => {
        try {
            await updateDeployment(deploymentId, {
                status: 'building',
            });
        } catch (e) {
            console.error('Failed to update to building:', e);
        }
    }, 2000);

    // Phase 2: Deploying (after 5 seconds)
    setTimeout(async () => {
        try {
            await updateDeployment(deploymentId, {
                status: 'deploying',
            });
        } catch (e) {
            console.error('Failed to update to deploying:', e);
        }
    }, 5000);

    // Phase 3: Ready (after 8 seconds)
    setTimeout(async () => {
        try {
            // Use project region or fall back to default
            const mockUrl = `https://dfy-${projectSlug}-853384839522.${config.gcp.region}.run.app`;

            await updateDeployment(deploymentId, {
                status: 'ready',
                url: mockUrl,
                readyAt: new Date(),
                buildDurationMs: 8000,
            });

            await updateProject(projectId, {
                productionUrl: mockUrl,
            });
        } catch (e) {
            console.error('Failed to update to ready:', e);
        }
    }, 8000);
}
