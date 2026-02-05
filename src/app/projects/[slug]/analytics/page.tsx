import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getProjectBySlugGlobal, getTeamMembership } from '@/lib/db';
import { getAnalyticsStats } from '@/lib/analytics';
import { AnalyticsCharts } from '@/components/analytics/AnalyticsCharts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default async function ProjectAnalyticsPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const session = await getSession();

    if (!session) {
        redirect('/login');
    }

    const { slug } = await params;
    const project = await getProjectBySlugGlobal(slug);

    if (!project) {
        notFound();
    }

    // Check permissions
    // Allow if user is the project owner
    const isOwner = project.userId === session.user.id;
    let hasAccess = isOwner;

    // If not owner, check if user is a member of the project's team
    if (!isOwner && project.teamId) {
        const membership = await getTeamMembership(project.teamId, session.user.id);
        if (membership) {
            hasAccess = true;
        }
    }

    if (!hasAccess) {
        // Return 404 to avoid leaking project existence
        notFound();
    }

    // Determine Site ID
    // Prioritize custom domain, fallback to production URL, fallback to null
    let siteId = project.customDomain || project.productionUrl;

    if (siteId) {
        // Strip protocol and trailing slash
        siteId = siteId.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    // Fetch analytics data
    // If no siteId, we can't fetch data.
    const analyticsData = siteId ? await getAnalyticsStats(siteId) : null;

    return (
        <div className="p-8 max-w-7xl mx-auto">
             <div className="mb-8">
                <Link
                    href={`/dashboard/${project.id}`}
                    className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Dashboard
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Analytics</h1>
                        <p className="text-[var(--muted-foreground)]">
                            Traffic insights for <span className="text-[var(--foreground)] font-medium">{siteId || project.name}</span>
                        </p>
                    </div>
                </div>
            </div>

            {analyticsData ? (
                <AnalyticsCharts data={analyticsData} period="30d" />
            ) : (
                <div className="p-12 rounded-xl border border-[var(--border)] bg-[var(--card)] text-center">
                    <h3 className="text-xl font-semibold mb-2">No Analytics Data Available</h3>
                    <p className="text-[var(--muted-foreground)] mb-6">
                        {siteId
                            ? "We couldn't fetch analytics data for this project. Please check if Plausible is configured correctly."
                            : "This project doesn't have a production URL or custom domain configured."}
                    </p>
                    {!siteId && (
                         <Link href={`/dashboard/${project.id}/settings`} className="btn btn-primary">
                            Configure Domain
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}
