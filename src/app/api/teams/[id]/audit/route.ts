import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTeamMembership, getUserById } from '@/lib/db';
import { listAuditLogs } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: teamId } = await params;
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const membership = await getTeamMembership(teamId, session.user.id);
        if (!membership) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403, headers: securityHeaders }
            );
        }

        const logs = await listAuditLogs(teamId);

        // Enhance logs with user details
        const enhancedLogs = await Promise.all(logs.map(async (log) => {
            const user = await getUserById(log.userId);
            return {
                ...log,
                userName: user?.name || user?.email || 'Unknown User',
                userAvatar: user?.avatarUrl
            };
        }));

        return NextResponse.json(
            { logs: enhancedLogs },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: securityHeaders }
        );
    }
}
