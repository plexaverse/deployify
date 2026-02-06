import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getProjectBySlugGlobal, getTeamMembership, listDeploymentsByProject } from '@/lib/db';
import { getAnalyticsStats } from '@/lib/analytics';
import { AnalyticsCharts } from '@/components/analytics/AnalyticsCharts';
import { DeploymentMetricsCharts } from '@/components/analytics/DeploymentMetricsCharts';

interface PageProps {
    params: Promise<{
        slug: string;
    }>;
    searchParams: Promise<{
        period?: string;
    }>;
}

export const metadata: Metadata = {
    title: 'Analytics | Deployify',
};

export default async function ProjectAnalyticsPage({ params, searchParams }: PageProps) {
    const session = await getSession();

    if (!session) {
        redirect('/login');
    }

    const { slug } = await params;
    const { period: searchPeriod } = await searchParams;

    const project = await getProjectBySlugGlobal(slug);

    if (!project) {
        notFound();
    }

    // Access control
    const isOwner = project.userId === session.user.id;
    let hasAccess = isOwner;

    if (!hasAccess && project.teamId) {
        const membership = await getTeamMembership(project.teamId, session.user.id);
        if (membership) {
            hasAccess = true;
        }
    }

    if (!hasAccess) {
        // Return 404 to avoid leaking project existence
        notFound();
    }

    // Determine site ID (domain)
    let siteId = project.customDomain;

    // Normalize production URL to get domain
    if (!siteId && project.productionUrl) {
        try {
            // productionUrl might be "https://..." or just "..."
            const urlStr = project.productionUrl.startsWith('http')
                ? project.productionUrl
                : `https://${project.productionUrl}`;

            const url = new URL(urlStr);
            siteId = url.hostname;
        } catch (e) {
            // If parsing fails, use raw value or fallback
            siteId = project.productionUrl;
        }
    }

    // Fallback logic
    if (!siteId) {
        // Use slug-based domain as fallback for display/mocking
        siteId = `${slug}.deployify.app`;
    }

    const period = searchPeriod || '30d';
    const stats = await getAnalyticsStats(siteId, period);

    // Fetch deployment metrics
    const deployments = await listDeploymentsByProject(project.id, 50);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
                <p className="text-[var(--muted-foreground)]">
                    Traffic and performance insights for <span className="font-mono text-[var(--foreground)]">{siteId}</span>
                </p>
            </div>

            {/* Deployment Metrics Section */}
            <div>
                <h2 className="text-xl font-semibold mb-4">Deployment Performance</h2>
                <DeploymentMetricsCharts deployments={deployments} />
            </div>

            <div className="pt-6 border-t border-[var(--border)]">
                <h2 className="text-xl font-semibold mb-4">Traffic Analytics</h2>
                {stats ? (
                    <AnalyticsCharts data={stats} period={period} />
                ) : (
                    <div className="p-12 rounded-xl border border-[var(--border)] bg-[var(--card)] text-center">
                        <h3 className="text-lg font-semibold mb-2">No Analytics Data</h3>
                        <p className="text-[var(--muted-foreground)]">
                            We couldn't fetch analytics data for this project. Ensure your project is deployed and the domain is correct.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
