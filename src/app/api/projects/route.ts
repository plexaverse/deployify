import { NextRequest, NextResponse } from 'next/server';
import { sanitizeClientMetadata } from '@/lib/storage-metadata';
import { getSession } from '@/lib/auth';
import { createProject, getProjectBySlug, listProjectsByTeam, listPersonalProjects, listTeamsForUser, getTeamMembership, updateProject } from '@/lib/db';
import { getRepo, createRepoWebhook, detectFramework } from '@/lib/github';
import { slugify, parseRepoFullName, generateId, validateConnectionString, validateRootDirectory } from '@/lib/utils';
import { securityHeaders } from '@/lib/security';
import { logAuditEvent } from '@/lib/audit';
import { encrypt } from '@/lib/crypto';
import { upsertSecret } from '@/lib/gcp/secrets';
import { claimProjectSlug, releaseProjectSlug } from '@/lib/slug-registry';
import {
    assessRepoBinding,
    buildRepoVerification,
    isWebhookAlreadyExistsError,
    repoOwnerKey,
} from '@/lib/repo-binding';
import type { EnvVariable, StorageConfig, StorageType } from '@/types';

// GET /api/projects - List user's projects
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const teamId = searchParams.get('teamId');

        let projects;

        if (teamId && teamId !== 'null' && teamId !== 'undefined') {
            // Verify user is member of the team
            const teams = await listTeamsForUser(session.user.id);
            const isMember = teams.some(t => t.id === teamId);

            if (!isMember) {
                return NextResponse.json(
                    { error: 'Unauthorized access to team' },
                    { status: 403, headers: securityHeaders }
                );
            }
            projects = await listProjectsByTeam(teamId);
        } else {
            // Default to personal projects if no teamId specified
            projects = await listPersonalProjects(session.user.id);
        }

        return NextResponse.json(
            { success: true, projects },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error listing projects:', error);
        return NextResponse.json(
            { error: 'Failed to list projects' },
            { status: 500, headers: securityHeaders }
        );
    }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const body = await request.json();
        const {
            repoFullName,
            name,
            rootDirectory = '',
            region,
            framework,
            buildCommand,
            installCommand,
            outputDirectory,
            envVariables,
            storageConfigs: inputStorageConfigs,
            teamId
        } = body;

        if (!repoFullName) {
            return NextResponse.json(
                { error: 'Repository is required' },
                { status: 400, headers: securityHeaders }
            );
        }

        const rootDirValidation = validateRootDirectory(rootDirectory);
        if (!rootDirValidation.valid) {
            return NextResponse.json(
                { error: rootDirValidation.error },
                { status: 400, headers: securityHeaders }
            );
        }

        // Verify team membership if creating project in a team
        if (teamId) {
            const membership = await getTeamMembership(teamId, session.user.id);

            if (!membership) {
                return NextResponse.json(
                    { error: 'Unauthorized access to team' },
                    { status: 403, headers: securityHeaders }
                );
            }

            if (membership.role === 'viewer') {
                return NextResponse.json(
                    { error: 'Forbidden: Viewers cannot create projects' },
                    { status: 403, headers: securityHeaders }
                );
            }
        }

        // Parse repo owner and name
        const { owner, repo } = parseRepoFullName(repoFullName);

        // Get repo details from GitHub
        const repoData = await getRepo(session.accessToken, owner, repo);

        // getRepo() is octokit repos.get, which succeeds for ANY repo the token can
        // merely READ - it is a visibility check, not an ownership one. Admin rights are
        // the only entitlement signal GitHub gives us, so decide the binding on that
        // before we reserve any global resource (a 403 after claimProjectSlug would leak
        // the reservation).
        const isRepoAdmin = repoData.permissions?.admin === true;
        const ownerKey = repoOwnerKey({ userId: session.user.id, teamId: teamId || null });
        const binding = await assessRepoBinding(repoData.full_name, ownerKey, isRepoAdmin);

        if (binding.conflict) {
            console.error(
                `[RepoBinding] ${binding.allowed ? 'Allowing' : 'Refusing'} unverified bind of ` +
                `"${repoData.full_name}" by ${ownerKey}; already held by ${binding.conflict.ownerKey} ` +
                `(project ${binding.conflict.projectId})`
            );
            await logAuditEvent(
                teamId || null,
                session.user.id,
                binding.allowed ? 'project.repo_binding_unverified' : 'project.repo_binding_refused',
                {
                    repoFullName: repoData.full_name,
                    conflictProjectId: binding.conflict.projectId,
                }
            );
        }

        if (!binding.allowed) {
            return NextResponse.json(
                { error: 'This repository is already connected by another account. Ask a repository admin to connect it.' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Generate slug
        const projectName = name || repoData.name;
        const desiredSlug = slugify(projectName);

        // Check if slug already exists for this user
        const existingProject = await getProjectBySlug(session.user.id, desiredSlug);
        if (existingProject) {
            return NextResponse.json(
                { error: 'A project with this name already exists' },
                { status: 400, headers: securityHeaders }
            );
        }

        // The slug also names a GLOBAL Cloud Run service and the public hostname
        // <slug>.deployify.io, so it must be globally unique - not just unique per user.
        const claim = await claimProjectSlug(desiredSlug, session.user.id);
        if (!claim.ok) {
            return NextResponse.json(
                { error: 'A project with this name already exists' },
                { status: 400, headers: securityHeaders }
            );
        }
        const slug = claim.slug;

        // Create webhook on the repository. Success (or a 422 "hook already exists")
        // proves admin rights, which is the entitlement signal we persist alongside the
        // binding - the failure is still swallowed, exactly as before.
        let webhookId: number | null = null;
        let webhookProvesAdmin = false;
        try {
            webhookId = await createRepoWebhook(session.accessToken, owner, repo);
            webhookProvesAdmin = true;
        } catch (error) {
            console.error('Failed to create webhook:', error);
            // GitHub answers 404 to a non-admin, so 422 means the hook is already there.
            webhookProvesAdmin = isWebhookAlreadyExistsError(error);
            // Continue without webhook - user may not have admin access
        }

        const repoVerification = buildRepoVerification(
            webhookId,
            isRepoAdmin || webhookProvesAdmin
        );

        // Detect framework if auto or not provided
        let selectedFramework = framework;
        if (!selectedFramework || selectedFramework === 'auto') {
            const detected = await detectFramework(session.accessToken, owner, repo, rootDirectory);
            selectedFramework = detected || 'nextjs';
        }

        // Determine defaults based on framework
        const defaultBuildCommand = 'npm run build';
        let defaultOutputDirectory = '.next';

        switch (selectedFramework) {
            case 'vite':
            case 'astro':
                defaultOutputDirectory = 'dist';
                break;
            case 'remix':
            case 'sveltekit':
                defaultOutputDirectory = 'build';
                break;
            case 'nuxt':
                defaultOutputDirectory = '.output';
                break;
            case 'bun':
                defaultOutputDirectory = 'dist';
                break;
            case 'nextjs':
            default:
                defaultOutputDirectory = '.next';
                break;
        }

        // Process environment variables (generate IDs and encrypt secrets)
        const warnings: string[] = [];
        const processedEnvVars: EnvVariable[] = (envVariables || []).map((env: Partial<EnvVariable>) => {
            const isSecret = Boolean(env.isSecret);
            const value = isSecret && env.value ? encrypt(env.value) : env.value || '';

            if (env.key && (env.key.includes('URL') || env.key.includes('CONNECTION') || env.key.includes('DSN') || env.key.includes('DATABASE')) && env.value) {
                const validation = validateConnectionString(env.value);
                if (!validation.valid) {
                    warnings.push(`${env.key}: ${validation.error}`);
                }
            }

            return {
                id: generateId('env'),
                key: env.key || '',
                value,
                isSecret,
                isEncrypted: isSecret,
                target: env.target || 'both',
                environment: env.environment || 'both',
                group: env.group || 'General',
            } as EnvVariable;
        });

        // Create the project
        const projectInput = {
            userId: session.user.id,
            teamId: teamId || undefined,
            name: projectName,
            slug,
            repoFullName: repoData.full_name,
            repoUrl: repoData.html_url,
            repoId: repoData.id,
            repoVerification,
            defaultBranch: repoData.default_branch,
            framework: selectedFramework,
            buildCommand: buildCommand || defaultBuildCommand,
            installCommand: installCommand || 'npm install',
            outputDirectory: outputDirectory || defaultOutputDirectory,
            rootDirectory,
            customDomain: null,
            githubToken: encrypt(session.accessToken), // Encrypt GitHub token
            region: region || null,
            envVariables: processedEnvVars,
            autoDeployPrs: true,
        };

        let project;
        try {
            project = await createProject(projectInput);
        } catch (createError) {
            // Do not leak the reservation if the project row was never written.
            await releaseProjectSlug(slug);
            throw createError;
        }

        // 3. Process storage configurations if provided
        if (inputStorageConfigs && Array.isArray(inputStorageConfigs) && inputStorageConfigs.length > 0) {
            const processedStorageConfigs: StorageConfig[] = [];

            for (const config of inputStorageConfigs) {
                const storageId = `storage_${generateId('')}`;
                let connectionStringSecretId: string | undefined;

                if (config.connectionString) {
                    const secretId = `deployify-${project.id}-${storageId}-conn`;
                    connectionStringSecretId = await upsertSecret(secretId, config.connectionString);
                }

                processedStorageConfigs.push({
                    id: storageId,
                    type: config.type as StorageType,
                    name: config.name,
                    status: 'active',
                    environment: config.environment || 'both',
                    envKey: config.envKey,
                    connectionStringSecretId,
                    // Same server-owned-key stripping the storage routes apply. Without it,
                    // project creation was a way to plant provisioned/resourceName/excessiveRoles
                    // straight into a connector, which privileged code paths then trust.
                    metadata: sanitizeClientMetadata(config.metadata || {}, 'POST /api/projects storageConfigs'),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }

            // Update project with storage configurations
            await updateProject(project.id, { storageConfigs: processedStorageConfigs });
        }

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'project.created',
            {
                projectId: project.id,
                name: project.name,
                repoFullName: project.repoFullName
            }
        );

        return NextResponse.json(
            {
                success: true,
                project,
                warning: warnings.length > 0 ? warnings.join(', ') : undefined
            },
            { status: 201, headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error creating project:', error);
        return NextResponse.json(
            { error: 'Failed to create project' },
            { status: 500, headers: securityHeaders }
        );
    }
}
