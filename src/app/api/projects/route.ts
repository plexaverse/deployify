import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listProjectsByUser, createProject, getProjectBySlug, listProjectsByTeam, listPersonalProjects, listTeamsForUser } from '@/lib/db';
import { getRepo, createRepoWebhook, detectFramework } from '@/lib/github';
import { slugify, parseRepoFullName, generateId } from '@/lib/utils';
import { securityHeaders } from '@/lib/security';
import { logAuditEvent } from '@/lib/audit';
import { encrypt } from '@/lib/crypto';
import type { EnvVariable } from '@/types';

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
            { projects },
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
            teamId
        } = body;

        if (!repoFullName) {
            return NextResponse.json(
                { error: 'Repository is required' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Parse repo owner and name
        const { owner, repo } = parseRepoFullName(repoFullName);

        // Get repo details from GitHub
        const repoData = await getRepo(session.accessToken, owner, repo);

        // Generate slug
        const projectName = name || repoData.name;
        const slug = slugify(projectName);

        // Check if slug already exists for this user
        const existingProject = await getProjectBySlug(session.user.id, slug);
        if (existingProject) {
            return NextResponse.json(
                { error: 'A project with this name already exists' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Create webhook on the repository
        try {
            await createRepoWebhook(session.accessToken, owner, repo);
        } catch (error) {
            console.error('Failed to create webhook:', error);
            // Continue without webhook - user may not have admin access
        }

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
            case 'nextjs':
            default:
                defaultOutputDirectory = '.next';
                break;
        }

        // Process environment variables (generate IDs and encrypt secrets)
        const processedEnvVars: EnvVariable[] = (envVariables || []).map((env: Partial<EnvVariable>) => {
            const isSecret = Boolean(env.isSecret);
            const value = isSecret && env.value ? encrypt(env.value) : env.value || '';

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
        const project = await createProject({
            userId: session.user.id,
            teamId: teamId || undefined,
            name: projectName,
            slug,
            repoFullName: repoData.full_name,
            repoUrl: repoData.html_url,
            defaultBranch: repoData.default_branch,
            framework: selectedFramework,
            buildCommand: buildCommand || defaultBuildCommand,
            installCommand: installCommand || 'npm install',
            outputDirectory: outputDirectory || defaultOutputDirectory,
            rootDirectory,
            customDomain: null,
            githubToken: session.accessToken,
            region: region || null,
            envVariables: processedEnvVars,
        });

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
            { project },
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
