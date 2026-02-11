import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listTeamsWithMembership, createTeam } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';

export async function GET() {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const teams = await listTeamsWithMembership(session.user.id);

        return NextResponse.json(
            { teams },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error listing teams:', error);
        return NextResponse.json(
            { error: 'Failed to list teams' },
            { status: 500, headers: securityHeaders }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const body = await request.json();
        const { name, slug } = body;

        if (!name || !slug) {
            return NextResponse.json(
                { error: 'Name and slug are required' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Validate slug format
        const slugRegex = /^[a-z0-9-]+$/;
        if (!slugRegex.test(slug)) {
            return NextResponse.json(
                { error: 'Slug must contain only lowercase letters, numbers, and hyphens' },
                { status: 400, headers: securityHeaders }
            );
        }

        const team = await createTeam({ name, slug }, session.user.id);

        await logAuditEvent(team.id, session.user.id, 'Team Created', { name, slug });

        return NextResponse.json(
            { team },
            { status: 201, headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error creating team:', error);
        return NextResponse.json(
            { error: 'Failed to create team' },
            { status: 500, headers: securityHeaders }
        );
    }
}
