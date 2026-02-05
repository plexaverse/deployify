import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateProject, getProjectById } from '@/lib/db';
import { checkProjectAccess } from '@/middleware/rbac';
import { enableCloudArmor } from '@/lib/gcp/armor';
import { securityHeaders } from '@/lib/security';

interface RouteParams {
    params: Promise<{ id: string }>;
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

        if (typeof body.enabled !== 'boolean') {
             return NextResponse.json(
                { error: 'Invalid enabled value' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Update database
        await updateProject(id, {
            cloudArmorEnabled: body.enabled
        });

        // Trigger GCP action if enabling
        if (body.enabled && project.cloudRunServiceId) {
            try {
                await enableCloudArmor(project.cloudRunServiceId);
            } catch (error) {
                console.error('Failed to enable Cloud Armor:', error);
                // We log the error but allow the DB update to persist as the UI state reflects intent
            }
        }

        const updatedProject = await getProjectById(id);

        return NextResponse.json(
            { project: updatedProject },
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
