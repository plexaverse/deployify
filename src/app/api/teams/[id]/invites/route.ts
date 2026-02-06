import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listInvitesForTeam, getTeamMembership } from '@/lib/db';
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

        // Check membership
        const membership = await getTeamMembership(id, session.user.id);
        if (!membership) {
             return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403, headers: securityHeaders }
            );
        }

        const invites = await listInvitesForTeam(id);

        return NextResponse.json(
            { invites },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error listing invites:', error);
        return NextResponse.json(
            { error: 'Failed to list invites' },
            { status: 500, headers: securityHeaders }
        );
    }
}
