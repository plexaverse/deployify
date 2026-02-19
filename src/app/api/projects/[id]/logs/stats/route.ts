import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getErrorRate } from '@/lib/gcp/logging';
import { getProductionServiceName } from '@/lib/gcp/cloudrun';
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
        const serviceName = getProductionServiceName(project.slug);
        const errorCount = await getErrorRate(serviceName, 24);

        return NextResponse.json(
            { errorCount, period: '24h' },
            { headers: securityHeaders }
        );

    } catch (error) {
        console.error('Error fetching log stats:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: securityHeaders }
        );
    }
}
