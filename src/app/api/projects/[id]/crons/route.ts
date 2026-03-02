import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { listCronJobs } from '@/lib/gcp/scheduler';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        const { id } = await params;

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status }
            );
        }

        const { project } = access;

        let accessToken: string;
        try {
            accessToken = await getGcpAccessToken();
        } catch (error) {
             console.error('Failed to get GCP token:', error);
             return NextResponse.json({ error: 'Failed to authenticate with GCP' }, { status: 500 });
        }

        const jobs = await listCronJobs(project.slug, accessToken);

        return NextResponse.json({ success: true, jobs });
    } catch (error) {
        console.error('Error fetching cron jobs:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
