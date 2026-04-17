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
    getUserById,
    getEnvVarsForDeployment,
    getBranchConnectionString,
    getMigrationsForDeployment
} from '@/lib/db';
import { generateCloudRunDeployConfig, submitCloudBuild } from '@/lib/gcp/cloudbuild';
import { getPreviewServiceName, deleteService } from '@/lib/gcp/cloudrun';
import { deleteDatabase as deleteSqlDatabase } from '@/lib/gcp/cloudsql';
import { deleteDatabase as deleteFirestoreDatabase } from '@/lib/gcp/firestore-admin';
import { getSecretValue } from '@/lib/gcp/secrets';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { parseBranchFromRef, shouldAutoDeploy, getProjectSlugForDeployment } from '@/lib/utils';
import type { GitHubPushEvent, GitHubPullRequestEvent } from '@/types';
import { decrypt } from '@/lib/crypto';
import { pollBuildStatus } from '@/lib/deployment';
import { logAuditEvent } from '@/lib/audit';

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
                // Ignore unknown events
                break;
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

    // Find the project
    const project = await getProjectByRepoFullName(repository.full_name);

    if (!project) {
        return;
    }

    // Check if we should deploy this branch
    if (!shouldAutoDeploy(project, branch)) {
        return;
    }

    // Determine deployment type and details
    const isDefaultBranch = branch === project.defaultBranch;
    const deploymentType = isDefaultBranch ? 'production' : 'branch';
    const projectSlug = getProjectSlugForDeployment(project, {
        type: deploymentType,
        gitBranch: branch
    });

    // Use preview env vars for non-default branches, unless overridden by branchEnvironments
    let envTarget: 'production' | 'preview' = isDefaultBranch ? 'production' : 'preview';
    if (project.branchEnvironments) {
        const branchEnv = project.branchEnvironments.find(be => be.branch === branch);
        if (branchEnv) {
            envTarget = branchEnv.envTarget;
        }
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
        type: deploymentType,
        status: 'queued',
        gitBranch: branch,
        gitCommitSha: head_commit.id,
        gitCommitMessage: head_commit.message,
        gitCommitAuthor: head_commit.author.username || head_commit.author.name,
    });

    await logAuditEvent(
        project.teamId || null,
        project.userId,
        'deployment.created',
        {
            projectId: project.id,
            deploymentId: deployment.id,
            trigger: 'webhook',
            branch,
            commitSha: head_commit.id
        }
    );

    try {
        // Get environment variables directly from project and split by target
        const { buildEnvVars, runtimeEnvVars, runtimeSecrets, cloudSqlInstances, needsVpc, vpcNetwork, vpcSubnet } = await getEnvVarsForDeployment(project, envTarget, {
            branch
        });

        // Extract automated migration tasks
        const migrations = await getMigrationsForDeployment(project, envTarget, {
            branch
        });

        // Decrypt GitHub token if present
        const gitToken = project.githubToken ? decrypt(project.githubToken) : undefined;

        // Generate build config with project's selected region
        const buildConfig = generateCloudRunDeployConfig({
            projectSlug: projectSlug,
            repoFullName: project.repoFullName,
            branch,
            commitSha: head_commit.id,
            envVars: {}, // Legacy support cleared
            buildEnvVars,
            runtimeEnvVars,
            runtimeSecrets,
            migrations,
            cloudSqlInstances,
            needsVpc,
            vpcNetwork,
            vpcSubnet,
            gitToken: gitToken,
            projectRegion: project.region, // Use project's region
            framework: project.framework,
            buildCommand: project.buildCommand,
            installCommand: project.installCommand,
            outputDirectory: project.outputDirectory,
            buildTimeout: project.buildTimeout,
            healthCheckPath: project.healthCheckPath,
            resources: project.resources,
            rootDirectory: project.rootDirectory,
        });

        // Submit build
        const { buildId, logUrl } = await submitCloudBuild(buildConfig, project.region);

        // Update deployment with build info
        await updateDeployment(deployment.id, {
            status: 'building',
            cloudBuildId: buildId,
            buildLogs: [logUrl],
        });

        // Start polling for build status
        pollBuildStatus(
            deployment.id,
            project.id,
            projectSlug,
            buildId,
            head_commit.id,
            project.region,
            project.webhookUrl,
            project.name,
            user.email,
            project.emailNotifications,
            project.repoFullName,
            undefined,
            gitToken
        );
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
        return;
    }

    // Get user for access token
    const user = await getUserById(project.userId);

    if (!user) {
        console.error(`User not found for project: ${project.id}`);
        return;
    }

    const previewServiceName = getPreviewServiceName(project.slug, pull_request.number);

    // Handle PR closed - cleanup preview deployment and ephemeral storage
    if (action === 'closed') {
        console.log(`[Cleanup] PR #${pull_request.number} closed for ${project.name}. Starting cleanup...`);
        try {
            const gcpAccessToken = await getGcpAccessToken();
            await deleteService(previewServiceName, gcpAccessToken, project.region);
            console.log(`[Cleanup] Cloud Run service ${previewServiceName} deleted.`);

            // Cleanup ephemeral databases if branching is enabled
            if (project.storageConfigs && project.storageConfigs.length > 0) {
                for (const storage of project.storageConfigs) {
                    if (!storage.branchingSettings?.enabled) continue;

                    // 1. Cloud SQL Cleanup
                    if (storage.type.includes('cloud-sql')) {
                        const instanceName = storage.metadata?.resourceName as string;
                        if (!instanceName || !storage.connectionStringSecretId) continue;

                        try {
                            const baseConnectionString = await getSecretValue(storage.connectionStringSecretId);
                            if (!baseConnectionString) {
                                console.warn(`[Cleanup] Skipping SQL cleanup for ${storage.name}: Secret not found.`);
                                continue;
                            }

                            const branchedConnectionString = getBranchConnectionString(
                                baseConnectionString,
                                storage.type,
                                storage.branchingSettings,
                                { pullRequestNumber: pull_request.number }
                            );

                            const url = new URL(branchedConnectionString);
                            const dbName = url.pathname.split('/')[1];

                            if (dbName) {
                                console.log(`[Cleanup] Deleting ephemeral database ${dbName} from ${instanceName}`);
                                await deleteSqlDatabase(instanceName, dbName);
                                console.log(`[Cleanup] Successfully deleted SQL database ${dbName}.`);
                            }
                        } catch (e) {
                            console.error(`[Cleanup] Failed to delete ephemeral database for ${storage.name}:`, e);
                        }
                    }

                    // 2. Firestore Cleanup
                    if (storage.type === 'firestore') {
                        try {
                            const baseConnectionString = storage.connectionStringSecretId
                                ? await getSecretValue(storage.connectionStringSecretId)
                                : 'firestore://(default)';

                            const branchedConnectionString = getBranchConnectionString(
                                baseConnectionString || 'firestore://(default)',
                                storage.type,
                                storage.branchingSettings,
                                { pullRequestNumber: pull_request.number }
                            );

                            const databaseId = branchedConnectionString.replace('firestore://', '');

                            if (databaseId && databaseId !== '(default)') {
                                console.log(`[Cleanup] Deleting ephemeral Firestore database ${databaseId}`);
                                await deleteFirestoreDatabase(databaseId);
                                console.log(`[Cleanup] Successfully deleted Firestore database ${databaseId}.`);
                            }
                        } catch (e) {
                            console.error(`[Cleanup] Failed to delete ephemeral Firestore database for ${storage.name}:`, e);
                        }
                    }

                    // 3. Redis Cleanup
                    if (storage.type === 'memorystore-redis') {
                        try {
                            const baseConnectionString = storage.connectionStringSecretId
                                ? await getSecretValue(storage.connectionStringSecretId)
                                : null;

                            if (!baseConnectionString) {
                                console.warn(`[Cleanup] Skipping Redis cleanup for ${storage.name}: Secret not found.`);
                                continue;
                            }

                            const branchedConnectionString = getBranchConnectionString(
                                baseConnectionString,
                                storage.type,
                                storage.branchingSettings,
                                { pullRequestNumber: pull_request.number }
                            );

                            console.log(`[Cleanup] Flushing ephemeral Redis DB at ${branchedConnectionString}`);
                            const Redis = (await import('ioredis')).default;
                            const redis = new Redis(branchedConnectionString, {
                                maxRetriesPerRequest: 1,
                                connectTimeout: 5000,
                                retryStrategy: () => null
                            });
                            redis.on('error', (err) => {
                                console.warn(`[Cleanup] Redis connection error for ${storage.name}: ${err.message}`);
                            });
                            await redis.flushdb();
                            redis.disconnect();
                            console.log(`[Cleanup] Successfully flushed Redis DB index.`);
                        } catch (e) {
                            console.error(`[Cleanup] Failed to flush ephemeral Redis DB for ${storage.name}:`, e);
                        }
                    }

                    // 4. MongoDB Cleanup
                    if (storage.type === 'mongodb-atlas') {
                        try {
                            const baseConnectionString = storage.connectionStringSecretId
                                ? await getSecretValue(storage.connectionStringSecretId)
                                : null;

                            if (!baseConnectionString) {
                                console.warn(`[Cleanup] Skipping MongoDB cleanup for ${storage.name}: Secret not found.`);
                                continue;
                            }

                            const branchedConnectionString = getBranchConnectionString(
                                baseConnectionString,
                                storage.type,
                                storage.branchingSettings,
                                { pullRequestNumber: pull_request.number }
                            );

                            console.log(`[Cleanup] Dropping ephemeral MongoDB database at ${branchedConnectionString}`);
                            const { MongoClient } = await import('mongodb');
                            const client = new MongoClient(branchedConnectionString, { serverSelectionTimeoutMS: 5000 });
                            await client.connect();
                            const dbName = new URL(branchedConnectionString).pathname.split('/')[1];
                            if (dbName) {
                                await client.db(dbName).dropDatabase();
                                console.log(`[Cleanup] Successfully dropped MongoDB database ${dbName}.`);
                            }
                            await client.close();
                        } catch (e) {
                            console.error(`[Cleanup] Failed to drop ephemeral MongoDB database for ${storage.name}:`, e);
                        }
                    }

                    // 5. PlanetScale Cleanup
                    if (storage.type === 'planetscale') {
                        const organization = storage.metadata?.organization as string;
                        const database = storage.metadata?.database as string;
                        const providerApiKey = storage.metadata?.providerApiKey as string;

                        if (organization && database && providerApiKey) {
                            const identifier = `pr${pull_request.number}`;
                            console.log(`[Cleanup] Deleting ephemeral PlanetScale branch ${identifier}`);

                            try {
                                const psRes = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/branches/${identifier}`, {
                                    method: 'DELETE',
                                    headers: { 'Authorization': `Bearer ${providerApiKey}` }
                                });
                                if (psRes.ok) {
                                    console.log(`[Cleanup] Successfully deleted PlanetScale branch ${identifier}.`);
                                } else {
                                    console.warn(`[Cleanup] PlanetScale deletion returned status ${psRes.status}: ${await psRes.text()}`);
                                }
                            } catch (e) {
                                console.error(`[Cleanup] Failed to delete PlanetScale branch ${identifier}:`, e);
                            }
                        }
                    }

                    // 6. Supabase Cleanup
                    if (storage.type === 'supabase') {
                        const supabaseId = storage.metadata?.supabaseId as string;
                        const providerApiKey = storage.metadata?.providerApiKey as string;

                        if (supabaseId && providerApiKey) {
                            const identifier = `pr${pull_request.number}`;
                            console.log(`[Cleanup] Deleting ephemeral Supabase branch ${identifier}`);

                            try {
                                // 1. List branches to find ID
                                const listRes = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}/branches`, {
                                    headers: { 'Authorization': `Bearer ${providerApiKey}` }
                                });
                                if (listRes.ok) {
                                    const branches = await listRes.json();
                                    const branch = branches.find((b: { branch_name: string, id: string }) => b.branch_name === identifier);
                                    if (branch) {
                                        // 2. Delete branch by ID
                                        const delRes = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}/branches/${branch.id}`, {
                                            method: 'DELETE',
                                            headers: { 'Authorization': `Bearer ${providerApiKey}` }
                                        });
                                        if (delRes.ok) {
                                            console.log(`[Cleanup] Successfully deleted Supabase branch ${identifier}.`);
                                        } else {
                                            console.warn(`[Cleanup] Supabase deletion returned status ${delRes.status}.`);
                                        }
                                    } else {
                                        console.log(`[Cleanup] Supabase branch ${identifier} not found, skipping.`);
                                    }
                                }
                            } catch (e) {
                                console.error(`[Cleanup] Failed to delete Supabase branch ${identifier}:`, e);
                            }
                        }
                    }

                    // 7. Neon Cleanup
                    if (storage.type === 'neon') {
                        const neonProjectId = storage.metadata?.neonProjectId as string;
                        const providerApiKey = storage.metadata?.providerApiKey as string;

                        if (neonProjectId && providerApiKey) {
                            const identifier = `pr${pull_request.number}`;
                            console.log(`[Cleanup] Deleting ephemeral Neon branch ${identifier}`);

                            try {
                                // 1. List branches to find ID
                                const listRes = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}/branches`, {
                                    headers: { 'Authorization': `Bearer ${providerApiKey}` }
                                });
                                if (listRes.ok) {
                                    const data = await listRes.json();
                                    const branches = data.branches || [];
                                    const branch = branches.find((b: { name: string, id: string }) => b.name === identifier);
                                    if (branch) {
                                        // 2. Delete branch by ID
                                        const delRes = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}/branches/${branch.id}`, {
                                            method: 'DELETE',
                                            headers: { 'Authorization': `Bearer ${providerApiKey}` }
                                        });
                                        if (delRes.ok) {
                                            console.log(`[Cleanup] Successfully deleted Neon branch ${identifier}.`);
                                        } else {
                                            console.warn(`[Cleanup] Neon deletion returned status ${delRes.status}.`);
                                        }
                                    } else {
                                        console.log(`[Cleanup] Neon branch ${identifier} not found, skipping.`);
                                    }
                                }
                            } catch (e) {
                                console.error(`[Cleanup] Failed to delete Neon branch ${identifier}:`, e);
                            }
                        }
                    }
                }
            }
            console.log(`[Cleanup] Finished ephemeral cleanup for PR #${pull_request.number}.`);
        } catch (error) {
            console.error('Failed to cleanup preview deployment:', error);
        }
        return;
    }

    // Handle PR opened or synchronized - create/update preview deployment
    if (action === 'opened' || action === 'synchronize' || action === 'reopened') {
        // Check if automatic PR deployments are enabled
        if (project.autoDeployPrs === false) {
            return;
        }

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

        await logAuditEvent(
            project.teamId || null,
            project.userId,
            'deployment.created',
            {
                projectId: project.id,
                deploymentId: deployment.id,
                trigger: 'webhook',
                branch: pull_request.head.ref,
                commitSha: pull_request.head.sha
            }
        );

        try {
            // Get environment variables directly from project and split by target
            const envTarget = 'preview';
            const { buildEnvVars, runtimeEnvVars, runtimeSecrets, cloudSqlInstances, needsVpc, vpcNetwork, vpcSubnet } = await getEnvVarsForDeployment(project, envTarget, {
                branch: pull_request.head.ref,
                pullRequestNumber: pull_request.number
            });

            // Extract automated migration tasks
            const migrations = await getMigrationsForDeployment(project, envTarget, {
                branch: pull_request.head.ref,
                pullRequestNumber: pull_request.number
            });

            // Decrypt GitHub token if present
            const gitToken = project.githubToken ? decrypt(project.githubToken) : undefined;

            // Generate build config for preview with project's selected region
            const projectSlug = getProjectSlugForDeployment(project, deployment);
            const buildConfig = generateCloudRunDeployConfig({
                projectSlug: projectSlug,
                repoFullName: project.repoFullName,
                branch: pull_request.head.ref,
                commitSha: pull_request.head.sha,
                envVars: {}, // Legacy support cleared
                buildEnvVars,
                runtimeEnvVars,
                runtimeSecrets,
                migrations,
                cloudSqlInstances,
                needsVpc,
                vpcNetwork,
                vpcSubnet,
                gitToken: gitToken,
                projectRegion: project.region, // Use project's region
                framework: project.framework,
                buildCommand: project.buildCommand,
                installCommand: project.installCommand,
                outputDirectory: project.outputDirectory,
                buildTimeout: project.buildTimeout,
                healthCheckPath: project.healthCheckPath,
                resources: project.resources,
                rootDirectory: project.rootDirectory,
            });

            // Submit build
            const { buildId, logUrl } = await submitCloudBuild(buildConfig, project.region);

            // Update deployment with build info
            await updateDeployment(deployment.id, {
                status: 'building',
                cloudBuildId: buildId,
                buildLogs: [logUrl],
            });

            // Start polling for build status
            pollBuildStatus(
                deployment.id,
                project.id,
                projectSlug,
                buildId,
                pull_request.head.sha,
                project.region,
                project.webhookUrl,
                project.name,
                user.email,
                project.emailNotifications,
                project.repoFullName,
                pull_request.number,
                gitToken
            );
        } catch (error) {
            console.error('Failed to start preview build:', error);
            await updateDeployment(deployment.id, {
                status: 'error',
                errorMessage: error instanceof Error ? error.message : 'Build failed',
            });
        }
    }
}
