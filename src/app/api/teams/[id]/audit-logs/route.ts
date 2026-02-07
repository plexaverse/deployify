import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listAuditLogs } from '@/lib/audit';
import { getTeamMembership } from '@/lib/db';
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

        // Check if user is member of the team
        const membership = await getTeamMembership(id, session.user.id);
        if (!membership) {
             return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403, headers: securityHeaders }
            );
        }

        const logs = await listAuditLogs(id);

        return NextResponse.json(
            { logs },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        return NextResponse.json(
            { error: 'Failed to fetch audit logs' },
            { status: 500, headers: securityHeaders }
        );
    }
}
