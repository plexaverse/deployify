import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getProjectById, updateProject, deleteProject, listDeploymentsByProject } from '@/lib/db';
import { securityHeaders } from '@/lib/security';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/projects/[id] - Get project details
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

        // Get recent deployments
        const deployments = await listDeploymentsByProject(id, 5);

        return NextResponse.json(
            { project, deployments },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error getting project:', error);
        return NextResponse.json(
            { error: 'Failed to get project' },
            { status: 500, headers: securityHeaders }
        );
    }
}

// PATCH /api/projects/[id] - Update project settings
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const project = await getProjectById(id);

        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        if (project.userId !== session.user.id) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403, headers: securityHeaders }
            );
        }

        const body = await request.json();

        // Only allow updating specific fields
        const allowedFields = [
            'name',
            'buildCommand',
            'installCommand',
            'outputDirectory',
            'rootDirectory',
            'customDomain',
            'region',
            'buildTimeout',
        ];

        const updates: Record<string, unknown> = {};
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updates[field] = body[field];
            }
        }

        // Validate buildTimeout
        if (updates.buildTimeout !== undefined) {
            const timeout = Number(updates.buildTimeout);
            if (isNaN(timeout) || timeout <= 0) {
                return NextResponse.json(
                    { error: 'Build timeout must be a positive number' },
                    { status: 400, headers: securityHeaders }
                );
            }
            updates.buildTimeout = timeout;
        }

        await updateProject(id, updates);

        const updatedProject = await getProjectById(id);

        return NextResponse.json(
            { project: updatedProject },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error updating project:', error);
        return NextResponse.json(
            { error: 'Failed to update project' },
            { status: 500, headers: securityHeaders }
        );
    }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const project = await getProjectById(id);

        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        if (project.userId !== session.user.id) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Delete project and all associated data
        await deleteProject(id);

        // TODO: Also delete Cloud Run services and cleanup

        return NextResponse.json(
            { success: true },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error deleting project:', error);
        return NextResponse.json(
            { error: 'Failed to delete project' },
            { status: 500, headers: securityHeaders }
        );
    }
}
