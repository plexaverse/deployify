'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/store';
import { AnalyticsCharts } from '@/components/analytics/AnalyticsCharts';
import { DeploymentMetricsCharts } from '@/components/analytics/DeploymentMetricsCharts';
import { RealtimeVisitors } from '@/components/analytics/RealtimeVisitors';
import { AnalyticsAlerts } from '@/components/analytics/AnalyticsAlerts';
import { Activity, BarChart3 } from 'lucide-react';
import { evaluatePerformance } from '@/lib/analytics/alerts';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Separator } from '@/components/ui/separator';

export default function ProjectAnalyticsPage() {
    const params = useParams();
    const router = useRouter();
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

    const handlePeriodChange = (newPeriod: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set('period', newPeriod);
        router.push(url.pathname + url.search);
    };

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
            } catch {
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
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <BarChart3 className="w-8 h-8 text-[var(--primary)]" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Project Insights &bull; {siteId}</span>
                        <h1 className="text-[7px] md:text-[9px] font-bold tracking-tight">Analytics</h1>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <RealtimeVisitors projectId={project.id} />
                    <div className="h-8 w-[1px] bg-[var(--border)] hidden md:block" />
                    <SegmentedControl
                        value={period}
                        onChange={handlePeriodChange}
                        options={[
                            { value: '1h', label: '1H' },
                            { value: '24h', label: '24H' },
                            { value: '7d', label: '7D' },
                            { value: '30d', label: '30D' },
                        ]}
                    />
                </div>
            </div>

            <div className="space-y-10">
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <Activity className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Performance Metrics</span>
                            <h3 className="text-[9px] font-bold">Deployment Performance</h3>
                        </div>
                    </div>
                    <Separator className="bg-[var(--border)]" />
                    <div className="p-6">
                        <DeploymentMetricsCharts deployments={deployments} />
                    </div>
                </Card>

                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <Activity className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Visitor Statistics</span>
                            <h3 className="text-[9px] font-bold">Traffic Analytics</h3>
                        </div>
                    </div>
                    <Separator className="bg-[var(--border)]" />
                    <div className="p-6 space-y-6">
                        {stats && <AnalyticsAlerts alerts={evaluatePerformance(stats)} />}

                        {loadingAnalytics && !stats ? (
                            <div className="space-y-4">
                                <Skeleton className="h-[400px] w-full rounded-xl" />
                            </div>
                        ) : stats ? (
                            <AnalyticsCharts data={stats} period={period} />
                        ) : (
                            <div className="p-8 text-center flex flex-col items-center">
                                <div className="w-12 h-12 rounded-2xl bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-6 shadow-sm">
                                    <BarChart3 className="w-6 h-6 text-[var(--muted-foreground)] opacity-50" />
                                </div>
                                <h3 className="text-[9px] font-bold mb-2 tracking-tight">No Analytics Data</h3>
                                <p className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] max-w-xs mx-auto leading-relaxed">
                                    We couldn&apos;t fetch analytics data for this project. Ensure your project is deployed and the domain is correctly configured.
                                </p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
