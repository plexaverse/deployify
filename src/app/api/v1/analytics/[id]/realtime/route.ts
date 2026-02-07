import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getProjectById, getTeamMembership } from '@/lib/db';
import { getRealtimeStats } from '@/lib/analytics';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const project = await getProjectById(id);
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Access control
        const isOwner = project.userId === session.user.id;
        let hasAccess = isOwner;

        if (!hasAccess && project.teamId) {
            const membership = await getTeamMembership(project.teamId, session.user.id);
            if (membership) hasAccess = true;
        }

        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const realtime = await getRealtimeStats(project.id);
        return NextResponse.json(realtime);
    } catch (error) {
        console.error('Realtime API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
