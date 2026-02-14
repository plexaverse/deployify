import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateProject, deleteProject, listDeploymentsByProject, getProjectById } from '@/lib/db';
import { checkProjectAccess } from '@/middleware/rbac';
import { securityHeaders } from '@/lib/security';
import { logAuditEvent } from '@/lib/audit';

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

        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status, headers: securityHeaders }
            );
        }

        const { project } = access;

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

        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status, headers: securityHeaders }
            );
        }

        const { project } = access;

        const body = await request.json();

        // Only allow updating specific fields
        const allowedFields = [
            'name',
            'framework',
            'buildCommand',
            'installCommand',
            'outputDirectory',
            'rootDirectory',
            'customDomain',
            'region',
            'buildTimeout',
            'webhookUrl',
            'resources',
            'autodeployBranches',
            'branchEnvironments',
            'emailNotifications',
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

        // Validate autodeployBranches
        if (updates.autodeployBranches !== undefined) {
            const branches = updates.autodeployBranches;
            if (!Array.isArray(branches) || !branches.every(b => typeof b === 'string')) {
                return NextResponse.json(
                    { error: 'autodeployBranches must be an array of strings' },
                    { status: 400, headers: securityHeaders }
                );
            }
        }

        // Validate resources
        if (updates.resources) {
            const resources = updates.resources as any;
            const validCpus = [1, 2, 4];
            const validMemory = ['256Mi', '512Mi', '1Gi', '2Gi', '4Gi'];

            if (resources.cpu && !validCpus.includes(Number(resources.cpu))) {
                return NextResponse.json(
                    { error: 'Invalid CPU value. Must be 1, 2, 4.' },
                    { status: 400, headers: securityHeaders }
                );
            }

            if (resources.memory && !validMemory.includes(resources.memory)) {
                return NextResponse.json(
                    { error: 'Invalid memory value.' },
                    { status: 400, headers: securityHeaders }
                );
            }

            if (resources.minInstances !== undefined) {
                const min = Number(resources.minInstances);
                if (isNaN(min) || min < 0) {
                    return NextResponse.json(
                        { error: 'Min instances must be 0 or greater.' },
                        { status: 400, headers: securityHeaders }
                    );
                }
            }

            if (resources.maxInstances !== undefined) {
                const max = Number(resources.maxInstances);
                const min = resources.minInstances !== undefined ? Number(resources.minInstances) : (project.resources?.minInstances || 0);

                if (isNaN(max) || max <= 0) {
                    return NextResponse.json(
                        { error: 'Max instances must be greater than 0.' },
                        { status: 400, headers: securityHeaders }
                    );
                }

                if (max < min) {
                    return NextResponse.json(
                        { error: 'Max instances cannot be less than min instances.' },
                        { status: 400, headers: securityHeaders }
                    );
                }
            }
        }

        await updateProject(id, updates);

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'project.updated',
            {
                projectId: project.id,
                updates: Object.keys(updates)
            }
        );

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

        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status, headers: securityHeaders }
            );
        }

        if (access.role !== 'owner' && access.role !== 'admin') {
            return NextResponse.json(
                { error: 'Forbidden: Only owners and admins can delete projects' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Delete project and all associated data
        await deleteProject(id);

        await logAuditEvent(
            access.project.teamId || null,
            session.user.id,
            'project.deleted',
            {
                projectId: id,
                name: access.project.name
            }
        );

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
