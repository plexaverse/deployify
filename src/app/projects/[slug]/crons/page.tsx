import { getSession } from '@/lib/auth';
import { getProjectBySlugGlobal, getTeamMembership } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import { CronJobsTable } from './CronJobsTable';

export default async function CronJobsPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const session = await getSession();
    if (!session) redirect('/login');

    const { slug } = await params;
    const project = await getProjectBySlugGlobal(slug);

    if (!project) notFound();

    // Access Check
    let hasAccess = false;
    if (project.userId === session.user.id) {
        hasAccess = true;
    } else if (project.teamId) {
        const membership = await getTeamMembership(project.teamId, session.user.id);
        if (membership) hasAccess = true;
    }

    if (!hasAccess) {
        return <div className="p-8 text-center text-red-500">You do not have access to this project.</div>;
    }

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-6">Scheduled Tasks</h1>
            <p className="text-[var(--muted-foreground)] mb-6">
                Manage your project&apos;s cron jobs defined in <code>vercel.json</code>.
            </p>
            <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] overflow-hidden">
                <CronJobsTable projectId={project.id} />
            </div>
        </div>
    );
}
