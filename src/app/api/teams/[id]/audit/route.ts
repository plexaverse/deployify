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
        const { id: teamId } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        // Check team membership
        const membership = await getTeamMembership(teamId, session.user.id);
        if (!membership) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403, headers: securityHeaders }
            );
        }

        const logs = await listAuditLogs(teamId);

        // Fetch user details for each log
        const userIds = Array.from(new Set(logs.map(log => log.userId)));
        const users = await Promise.all(userIds.map(uid => getUserById(uid)));
        const userMap = new Map(users.filter(u => u !== null).map(u => [u!.id, u!]));

        const enrichedLogs = logs.map(log => ({
            ...log,
            user: userMap.get(log.userId) ? {
                name: userMap.get(log.userId)!.name,
                email: userMap.get(log.userId)!.email,
                avatarUrl: userMap.get(log.userId)!.avatarUrl
            } : null
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
