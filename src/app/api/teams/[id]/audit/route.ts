import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTeamMembership, getUserById } from '@/lib/db';
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

        // Check user membership
        const membership = await getTeamMembership(id, session.user.id);

        if (!membership) {
            return NextResponse.json(
                { error: 'Forbidden. You are not a member of this team.' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Fetch logs
        const logs = await listAuditLogs(id);

        // Fetch user details for each log
        // We can optimize by fetching unique user IDs first
        const userIds = Array.from(new Set(logs.map(log => log.userId)));
        const userMap = new Map();

        await Promise.all(userIds.map(async (userId) => {
            const user = await getUserById(userId);
            if (user) {
                userMap.set(userId, { name: user.name, email: user.email, avatarUrl: user.avatarUrl });
            }
        }));

        const enrichedLogs = logs.map(log => ({
            ...log,
            user: userMap.get(log.userId) || { name: 'Unknown User' }
        }));

        return NextResponse.json(
            { logs: enrichedLogs },
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
