import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listTeamMembers, getUserById, getTeamMembership, getTeamById } from '@/lib/db';
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

        // Verify team exists
        const team = await getTeamById(id);
        if (!team) {
            return NextResponse.json(
                { error: 'Team not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        // Check if user is a member of the team
        const userMembership = await getTeamMembership(id, session.user.id);
        if (!userMembership) {
             return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403, headers: securityHeaders }
            );
        }

        const memberships = await listTeamMembers(id);

        const members = await Promise.all(memberships.map(async (m) => {
            const user = await getUserById(m.userId);
            return {
                ...m,
                user: user ? {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    avatarUrl: user.avatarUrl,
                    githubUsername: user.githubUsername,
                } : null
            };
        }));

        return NextResponse.json(
            { members },
            { headers: securityHeaders }
        );

    } catch (error) {
        console.error('Error listing team members:', error);
        return NextResponse.json(
            { error: 'Failed to list team members' },
            { status: 500, headers: securityHeaders }
        );
    }
}
