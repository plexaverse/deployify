import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listTeamsForUser } from '@/lib/db';
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

        const teams = await listTeamsForUser(session.user.id);

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
