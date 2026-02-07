import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAnalyticsStats } from '@/lib/analytics';
import { checkProjectAccess } from '@/middleware/rbac';
import { securityHeaders } from '@/lib/security';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || '30d';

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

        const stats = await getAnalyticsStats(id, period);

        return NextResponse.json(
            { stats },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error fetching analytics stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch analytics stats' },
            { status: 500, headers: securityHeaders }
        );
    }
}
