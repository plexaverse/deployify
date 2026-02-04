import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listProjectsByUser, createProject, getProjectBySlug } from '@/lib/db';
import { getRepo, createRepoWebhook } from '@/lib/github';
import { slugify, parseRepoFullName } from '@/lib/utils';
import { securityHeaders } from '@/lib/security';

// GET /api/projects - List user's projects
export async function GET() {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const projects = await listProjectsByUser(session.user.id);

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
            framework = 'nextjs',
            buildCommand,
            installCommand,
            outputDirectory
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
        let webhookId: number | undefined;
        try {
            webhookId = await createRepoWebhook(session.accessToken, owner, repo);
        } catch (error) {
            console.error('Failed to create webhook:', error);
            // Continue without webhook - user may not have admin access
        }

        // Determine defaults based on framework
        const defaultBuildCommand = framework === 'vite' ? 'npm run build' : 'npm run build';
        const defaultOutputDirectory = framework === 'vite' ? 'dist' : '.next';

        // Create the project
        const project = await createProject({
            userId: session.user.id,
            name: projectName,
            slug,
            repoFullName: repoData.full_name,
            repoUrl: repoData.html_url,
            defaultBranch: repoData.default_branch,
            framework,
            buildCommand: buildCommand || defaultBuildCommand,
            installCommand: installCommand || 'npm install',
            outputDirectory: outputDirectory || defaultOutputDirectory,
            rootDirectory,
            customDomain: null,
            githubToken: session.accessToken,
            region: region || null,
        });

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
