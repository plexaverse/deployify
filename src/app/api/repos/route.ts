import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listUserRepos } from '@/lib/github';
import { securityHeaders } from '@/lib/security';

// GET /api/repos - List user's GitHub repositories
export async function GET() {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const repos = await listUserRepos(session.accessToken, {
            perPage: 100,
            sort: 'pushed',
        });

        return NextResponse.json(
            { repos },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error listing repos:', error);
        return NextResponse.json(
            { error: 'Failed to list repositories' },
            { status: 500, headers: securityHeaders }
        );
    }
}
