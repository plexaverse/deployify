import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listTeamsWithMembership, createTeam } from '@/lib/db';
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
        const { name } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Team name is required' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Generate slug from name
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        if (!slug) {
            return NextResponse.json(
                { error: 'Invalid team name' },
                { status: 400, headers: securityHeaders }
            );
        }

        const team = await createTeam({
            name,
            slug,
            subscription: {
                tier: 'free',
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year free trial
            }
        }, session.user.id);

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
