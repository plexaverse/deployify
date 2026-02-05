import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getProjectById, getTeamMembership } from '@/lib/db';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { listCronJobs } from '@/lib/gcp/scheduler';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await requireAuth();
        const { id } = await params;

        const project = await getProjectById(id);

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Access Control
        let hasAccess = false;
        if (project.userId === session.user.id) {
            hasAccess = true;
        } else if (project.teamId) {
            const membership = await getTeamMembership(project.teamId, session.user.id);
            if (membership) {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        let accessToken: string;
        try {
            accessToken = await getGcpAccessToken();
        } catch (error) {
             console.error('Failed to get GCP token:', error);
             return NextResponse.json({ error: 'Failed to authenticate with GCP' }, { status: 500 });
        }

        const jobs = await listCronJobs(project.slug, accessToken);

        return NextResponse.json({ jobs });
    } catch (error) {
        console.error('Error fetching cron jobs:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
