import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTeamMembership } from '@/lib/db';
import { listAuditLogs } from '@/lib/audit';
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

        // Verify team membership
        const membership = await getTeamMembership(id, session.user.id);
        if (!membership) {
             return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Fetch logs
        const logs = await listAuditLogs(id, 50); // Get last 50 logs

        // Hydrate logs with user details if possible?
        // Ideally we would fetch user details for each log entry (actor)
        // For now, let's return raw logs. The UI can fetch user details or we can do it here.
        // Doing it here is better for performance.

        const { getUserById } = await import('@/lib/db');
        const logsWithUser = await Promise.all(logs.map(async (log) => {
            const user = await getUserById(log.userId);
            return {
                ...log,
                user: user ? { name: user.name, email: user.email, avatarUrl: user.avatarUrl } : null
            };
        }));

        return NextResponse.json(
            { logs: logsWithUser },
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
