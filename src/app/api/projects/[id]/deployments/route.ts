import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getProjectById, listDeploymentsByProject } from '@/lib/db';
import { checkProjectAccess } from '@/middleware/rbac';
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

        const { project } = access;

        const searchParams = request.nextUrl.searchParams;
        const limitParam = searchParams.get('limit');
        const limit = limitParam ? parseInt(limitParam, 10) : 100;

        const deployments = await listDeploymentsByProject(id, limit);

        return NextResponse.json(
            { deployments },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error getting deployments:', error);
        return NextResponse.json(
            { error: 'Failed to get deployments' },
            { status: 500, headers: securityHeaders }
        );
    }
}
