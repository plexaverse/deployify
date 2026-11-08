import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateProject, getProjectById } from '@/lib/db';
import { checkProjectAccess } from '@/middleware/rbac';
import { enableCloudArmor, getSecurityMetrics } from '@/lib/gcp/armor';
import { Project } from '@/types';
import { securityHeaders } from '@/lib/security';

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

        const metrics = await getSecurityMetrics();

        return NextResponse.json(
            { success: true, metrics },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error fetching security metrics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch security metrics' },
            { status: 500, headers: securityHeaders }
        );
    }
}

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
        const updates: Partial<Project> = {};

        if (body.enabled !== undefined) {
            if (typeof body.enabled !== 'boolean') {
                return NextResponse.json(
                    { error: 'Invalid enabled value' },
                    { status: 400, headers: securityHeaders }
                );
            }
            updates.cloudArmorEnabled = body.enabled;
            updates.cloudArmorMode = body.enabled ? (project.cloudArmorMode || 'prevention') : 'off';
        }

        if (body.mode !== undefined) {
            if (!['off', 'detection', 'prevention'].includes(body.mode)) {
                return NextResponse.json(
                    { error: 'Invalid mode value' },
                    { status: 400, headers: securityHeaders }
                );
            }
            updates.cloudArmorMode = body.mode;
            updates.cloudArmorEnabled = body.mode !== 'off';
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { error: 'No valid updates provided' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Update database
        await updateProject(id, updates);

        // Trigger GCP action if enabling or changing mode
        if (updates.cloudArmorEnabled && project.cloudRunServiceId) {
            try {
                await enableCloudArmor(project.cloudRunServiceId);
            } catch (error) {
                console.error('Failed to enable Cloud Armor:', error);
                // We log the error but allow the DB update to persist as the UI state reflects intent
            }
        }

        const updatedProject = await getProjectById(id);

        return NextResponse.json(
            { success: true, project: updatedProject },
            { headers: securityHeaders }
        );

    } catch (error) {
        console.error('Error updating security settings:', error);
        return NextResponse.json(
            { error: 'Failed to update security settings' },
            { status: 500, headers: securityHeaders }
        );
    }
}
