'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useStore } from '@/store';
import { AnalyticsCharts } from '@/components/analytics/AnalyticsCharts';
import { DeploymentMetricsCharts } from '@/components/analytics/DeploymentMetricsCharts';
import { RealtimeVisitors } from '@/components/analytics/RealtimeVisitors';
import { AnalyticsAlerts } from '@/components/analytics/AnalyticsAlerts';
import { evaluatePerformance } from '@/lib/analytics/alerts';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function ProjectAnalyticsPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const projectId = params.id as string;
    const period = searchParams.get('period') || '30d';

    const {
        currentProject,
        analyticsData: stats,
        isLoadingProject: loadingProject,
        isLoadingAnalytics: loadingAnalytics,
        fetchProjectDetails,
        fetchProjectAnalytics,
        currentDeployments: deployments
    } = useStore();

    useEffect(() => {
        if (projectId) {
            fetchProjectDetails(projectId);
            fetchProjectAnalytics(projectId, period);
        }
    }, [projectId, period, fetchProjectDetails, fetchProjectAnalytics]);

    const project = currentProject;

    // Site ID logic
    const siteId = useMemo(() => {
        if (!project) return '';

        let id = project.customDomain;
        if (!id && project.productionUrl) {
            try {
                const urlStr = project.productionUrl.startsWith('http')
                    ? project.productionUrl
                    : `https://${project.productionUrl}`;

                const url = new URL(urlStr);
                id = url.hostname;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) {
                id = project.productionUrl;
            }
        }

        return id || `${project.slug || 'project'}.deployify.app`;
    }, [project]);

    if (loadingProject && !project) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                </div>
            </div>
        );
    }

    if (!project) return null;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
                    <p className="text-[var(--muted-foreground)]">
                        Traffic and performance insights for <span className="font-mono text-[var(--foreground)]">{siteId}</span>
                    </p>
                </div>
                <RealtimeVisitors projectId={project.id} />
            </div>

            <div>
                <h2 className="text-xl font-semibold mb-4">Deployment Performance</h2>
                <DeploymentMetricsCharts deployments={deployments} />
            </div>

            <div className="pt-6 border-t border-[var(--border)]">
                <h2 className="text-xl font-semibold mb-4">Traffic Analytics</h2>

                {stats && <div className="mb-6"><AnalyticsAlerts alerts={evaluatePerformance(stats)} /></div>}

                {loadingAnalytics && !stats ? (
                    <div className="space-y-4">
                        <Skeleton className="h-[400px] w-full rounded-xl" />
                    </div>
                ) : stats ? (
                    <AnalyticsCharts data={stats} period={period} />
                ) : (
                    <Card className="p-12 text-center">
                        <h3 className="text-lg font-semibold mb-2">No Analytics Data</h3>
                        <p className="text-[var(--muted-foreground)]">
                            We couldn&apos;t fetch analytics data for this project. Ensure your project is deployed and the domain is correct.
                        </p>
                    </Card>
                )}
            </div>
        </div>
    );
}
