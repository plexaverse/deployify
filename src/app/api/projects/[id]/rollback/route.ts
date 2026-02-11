import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess, hasRole } from '@/middleware/rbac';
import { updateTraffic, getProductionServiceName } from '@/lib/gcp/cloudrun';
import { getGcpAccessToken, isRunningOnGCP } from '@/lib/gcp/auth';
import { securityHeaders } from '@/lib/security';
import { logAuditEvent } from '@/lib/audit';

interface RouteParams {
    params: Promise<{ id: string }>;
}

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

        // Check project access
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status, headers: securityHeaders }
            );
        }

        if (!hasRole(access.membership?.role, 'member')) {
            return NextResponse.json(
                { error: 'Forbidden: Member access required' },
                { status: 403, headers: securityHeaders }
            );
        }

        const { project } = access;
        const body = await request.json();
        const { revisionName } = body;

        if (!revisionName) {
            return NextResponse.json(
                { error: 'Revision name is required' },
                { status: 400, headers: securityHeaders }
            );
        }

        if (isRunningOnGCP()) {
            try {
                const serviceName = getProductionServiceName(project.slug);
                const accessToken = await getGcpAccessToken();

                await updateTraffic(
                    serviceName,
                    revisionName,
                    accessToken,
                    project.region
                );

                await logAuditEvent(
                    project.teamId || null,
                    session.user.id,
                    'deployment.rollback',
                    {
                        projectId: project.id,
                        revisionName
                    }
                );

                return NextResponse.json(
                    { message: 'Rollback successful' },
                    { status: 200, headers: securityHeaders }
                );
            } catch (error) {
                console.error('Rollback failed:', error);
                return NextResponse.json(
                    { error: 'Failed to perform rollback' },
                    { status: 500, headers: securityHeaders }
                );
            }
        } else {
            // Local development simulation
            console.log(`[SIMULATION] Rolling back project ${project.name} to revision ${revisionName}`);

            await logAuditEvent(
                project.teamId || null,
                session.user.id,
                'deployment.rollback',
                {
                    projectId: project.id,
                    revisionName,
                    simulated: true
                }
            );

            return NextResponse.json(
                { message: 'Rollback simulated (local dev mode)' },
                { status: 200, headers: securityHeaders }
            );
        }

    } catch (error) {
        console.error('Error handling rollback:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: securityHeaders }
        );
    }
}
