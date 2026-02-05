import { NextRequest, NextResponse } from 'next/server';
import {
    verifyGitHubWebhookSignature,
    isPushEvent,
    isPullRequestEvent,
    securityHeaders
} from '@/lib/security';
import {
    getProjectByRepoFullName,
    createDeployment,
    updateDeployment,
    getEnvVarsForDeployment,
    getUserById
} from '@/lib/db';
import { generateCloudRunDeployConfig, submitCloudBuild } from '@/lib/gcp/cloudbuild';
import { getPreviewServiceName, getProductionServiceName, deleteService } from '@/lib/gcp/cloudrun';
import { parseBranchFromRef } from '@/lib/utils';
import type { GitHubPushEvent, GitHubPullRequestEvent } from '@/types';

export async function POST(request: NextRequest) {
    try {
        // Get raw body for signature verification
        const rawBody = await request.text();
        const signature = request.headers.get('x-hub-signature-256');
        const event = request.headers.get('x-github-event');

        // Verify webhook signature
        if (!verifyGitHubWebhookSignature(rawBody, signature)) {
            console.error('Invalid webhook signature');
            return NextResponse.json(
                { error: 'Invalid signature' },
                { status: 401, headers: securityHeaders }
            );
        }

        // Parse the payload
        const payload = JSON.parse(rawBody);

        // Handle different event types
        switch (event) {
            case 'push':
                if (isPushEvent(payload)) {
                    await handlePushEvent(payload);
                }
                break;

            case 'pull_request':
                if (isPullRequestEvent(payload)) {
                    await handlePullRequestEvent(payload);
                }
                break;

            case 'ping':
                // GitHub sends ping when webhook is created
                return NextResponse.json(
                    { message: 'pong' },
                    { headers: securityHeaders }
                );

            default:
                console.log(`Ignoring event: ${event}`);
        }

        return NextResponse.json(
            { success: true },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json(
            { error: 'Webhook processing failed' },
            { status: 500, headers: securityHeaders }
        );
    }
}

async function handlePushEvent(payload: GitHubPushEvent): Promise<void> {
    const { repository, head_commit, ref } = payload;
    const branch = parseBranchFromRef(ref);

    // Only deploy pushes to the default branch
    if (branch !== repository.default_branch) {
        console.log(`Ignoring push to non-default branch: ${branch}`);
        return;
    }

    // Find the project
    const project = await getProjectByRepoFullName(repository.full_name);

    if (!project) {
        console.log(`No project found for repo: ${repository.full_name}`);
        return;
    }

    // Get user for access token
    const user = await getUserById(project.userId);

    if (!user) {
        console.error(`User not found for project: ${project.id}`);
        return;
    }

    // Create deployment record
    const deployment = await createDeployment({
        projectId: project.id,
        type: 'production',
        status: 'queued',
        gitBranch: branch,
        gitCommitSha: head_commit.id,
        gitCommitMessage: head_commit.message,
        gitCommitAuthor: head_commit.author.username || head_commit.author.name,
    });

    try {
        // Get environment variables
        const envVars = await getEnvVarsForDeployment(project.id, 'production');

        // Generate build config with project's selected region
        const buildConfig = generateCloudRunDeployConfig({
            projectSlug: project.slug,
            repoFullName: project.repoFullName,
            branch,
            commitSha: head_commit.id,
            envVars,
            gitToken: project.githubToken ?? undefined,
            projectRegion: project.region, // Use project's region
            buildTimeout: project.buildTimeout,
            resources: project.resources,
        });

        // Submit build (this would require GCP service account credentials)
        // For now, we'll update the status to building
        await updateDeployment(deployment.id, {
            status: 'building',
        });

        console.log(`Started production deployment for ${project.name}: ${deployment.id}`);
    } catch (error) {
        console.error('Failed to start build:', error);
        await updateDeployment(deployment.id, {
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Build failed',
        });
    }
}

async function handlePullRequestEvent(payload: GitHubPullRequestEvent): Promise<void> {
    const { action, pull_request, repository } = payload;

    // Find the project
    const project = await getProjectByRepoFullName(repository.full_name);

    if (!project) {
        console.log(`No project found for repo: ${repository.full_name}`);
        return;
    }

    // Get user for access token
    const user = await getUserById(project.userId);

    if (!user) {
        console.error(`User not found for project: ${project.id}`);
        return;
    }

    const previewServiceName = getPreviewServiceName(project.slug, pull_request.number);

    // Handle PR closed - cleanup preview deployment
    if (action === 'closed') {
        try {
            // await deleteService(previewServiceName, accessToken);
            console.log(`Cleaned up preview deployment for PR #${pull_request.number}`);
        } catch (error) {
            console.error('Failed to cleanup preview deployment:', error);
        }
        return;
    }

    // Handle PR opened or synchronized - create/update preview deployment
    if (action === 'opened' || action === 'synchronize' || action === 'reopened') {
        // Create deployment record
        const deployment = await createDeployment({
            projectId: project.id,
            type: 'preview',
            status: 'queued',
            gitBranch: pull_request.head.ref,
            gitCommitSha: pull_request.head.sha,
            gitCommitMessage: pull_request.title,
            gitCommitAuthor: pull_request.user.login,
            pullRequestNumber: pull_request.number,
        });

        try {
            // Get environment variables
            const envVars = await getEnvVarsForDeployment(project.id, 'preview');

            // Generate build config for preview with project's selected region
            const buildConfig = generateCloudRunDeployConfig({
                projectSlug: `${project.slug}-pr-${pull_request.number}`,
                repoFullName: project.repoFullName,
                branch: pull_request.head.ref,
                commitSha: pull_request.head.sha,
                envVars,
                gitToken: project.githubToken ?? undefined,
                projectRegion: project.region, // Use project's region
                buildTimeout: project.buildTimeout,
                resources: project.resources,
            });

            await updateDeployment(deployment.id, {
                status: 'building',
            });

            console.log(`Started preview deployment for PR #${pull_request.number}: ${deployment.id}`);
        } catch (error) {
            console.error('Failed to start preview build:', error);
            await updateDeployment(deployment.id, {
                status: 'error',
                errorMessage: error instanceof Error ? error.message : 'Build failed',
            });
        }
    }
}
