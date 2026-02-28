'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Clock,
    GitBranch,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    CheckCircle2,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    XCircle,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Loader2,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    AlertCircle,
    ArrowRight
} from 'lucide-react';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Deployment, LighthouseMetrics } from '@/types';

export default function CompareDeploymentsPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const projectId = params.id as string;

    const {
        currentProject,
        currentDeployments,
        fetchProjectDetails,
        isLoadingProject
    } = useStore();

    const [baseId, setBaseId] = useState<string>(searchParams.get('base') || '');
    const [targetId, setTargetId] = useState<string>(searchParams.get('target') || '');

    useEffect(() => {
        if (projectId) {
            fetchProjectDetails(projectId);
        }
    }, [projectId, fetchProjectDetails]);

    // Set defaults if not provided
    useEffect(() => {
        if (!isLoadingProject && currentDeployments.length >= 2) {
            setTimeout(() => {
                if (!baseId) setBaseId(currentDeployments[1].id);
                if (!targetId) setTargetId(currentDeployments[0].id);
            }, 0);
        }
    }, [isLoadingProject, currentDeployments, baseId, targetId]);

    const baseDeployment = currentDeployments.find(d => d.id === baseId);
    const targetDeployment = currentDeployments.find(d => d.id === targetId);

    const updateUrl = (newBase: string, newTarget: string) => {
        router.push(`/dashboard/${projectId}/deployments/compare?base=${newBase}&target=${newTarget}`);
    };

    const handleBaseChange = (id: string) => {
        setBaseId(id);
        updateUrl(id, targetId);
    };

    const handleTargetChange = (id: string) => {
        setTargetId(id);
        updateUrl(baseId, id);
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return '-';
        const seconds = Math.floor(ms / 1000);
        return `${seconds}s`;
    };

    const getScoreColor = (score: number) => {
        if (score >= 0.9) return 'text-[var(--success)]';
        if (score >= 0.5) return 'text-[var(--warning)]';
        return 'text-[var(--error)]';
    };

    const renderMetricDiff = (
        baseVal: number | undefined | null,
        targetVal: number | undefined | null,
        formatter: (v: number) => string,
        inverse = false // true means lower is better (e.g. duration, LCP)
    ) => {
        if (baseVal === undefined || baseVal === null || targetVal === undefined || targetVal === null) return null;

        const diff = targetVal - baseVal;
        const percent = baseVal !== 0 ? (diff / baseVal) * 100 : 0;
        const isImprovement = inverse ? diff < 0 : diff > 0;
        const isNeutral = diff === 0;

        if (isNeutral) return <span className="text-[var(--muted-foreground)] text-xs ml-2">No change</span>;

        return (
            <span className={cn("text-xs ml-2 flex items-center gap-0.5", isImprovement ? "text-[var(--success)]" : "text-[var(--error)]")}>
                {diff > 0 ? '+' : ''}{formatter(diff)} ({diff > 0 ? '+' : ''}{percent.toFixed(1)}%)
            </span>
        );
    };

    if (isLoadingProject) {
         return (
            <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
                <div className="space-y-4">
                    <Skeleton className="h-8 w-32" />
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-1/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <Skeleton className="h-96 w-full rounded-xl" />
                     <Skeleton className="h-96 w-full rounded-xl" />
                </div>
            </div>
        );
    }

    if (!currentProject) return null;

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10 animate-fade-in pb-24">
            <div className="space-y-4">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.back()}
                    className="group text-[var(--muted-foreground)] hover:text-[var(--foreground)] -ml-2"
                >
                    <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                    Back to Project
                </Button>
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">Compare Deployments</h1>
                    <p className="text-[var(--muted-foreground)] text-lg">
                        Analyze differences in build performance and web vitals between two deployments.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Base Deployment Selector */}
                <Card className="p-6 space-y-6">
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-3 block">Base Deployment (Previous)</label>
                        <NativeSelect
                            value={baseId}
                            onChange={(e) => handleBaseChange(e.target.value)}
                        >
                            <option value="">Select deployment</option>
                            {currentDeployments.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.gitCommitMessage} ({d.gitCommitSha.substring(0, 7)})
                                </option>
                            ))}
                        </NativeSelect>
                    </div>

                    {baseDeployment ? (
                        <DeploymentSummary deployment={baseDeployment} />
                    ) : (
                         <div className="h-48 flex items-center justify-center text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-lg">
                            Select a deployment
                        </div>
                    )}
                </Card>

                {/* Target Deployment Selector */}
                <Card className="p-6 space-y-6">
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-3 block">Target Deployment (Current)</label>
                        <NativeSelect
                            value={targetId}
                            onChange={(e) => handleTargetChange(e.target.value)}
                        >
                            <option value="">Select deployment</option>
                            {currentDeployments.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.gitCommitMessage} ({d.gitCommitSha.substring(0, 7)})
                                </option>
                            ))}
                        </NativeSelect>
                    </div>

                    {targetDeployment ? (
                        <DeploymentSummary deployment={targetDeployment} />
                    ) : (
                        <div className="h-48 flex items-center justify-center text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-lg">
                            Select a deployment
                        </div>
                    )}
                </Card>
            </div>

            {/* Comparison Table */}
            {baseDeployment && targetDeployment && (
                <Card className="overflow-hidden p-0 border-[var(--border)] shadow-sm">
                    <div className="bg-[var(--muted)]/5 px-6 py-4 border-b border-[var(--border)]">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Comparison Metrics</h3>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                        <ComparisonRow
                            label="Build Duration"
                            baseValue={formatDuration(baseDeployment.buildDurationMs)}
                            targetValue={
                                <span className="flex items-center">
                                    {formatDuration(targetDeployment.buildDurationMs)}
                                    {renderMetricDiff(baseDeployment.buildDurationMs, targetDeployment.buildDurationMs, (v) => `${(v/1000).toFixed(1)}s`, true)}
                                </span>
                            }
                        />

                        {/* Lighthouse Performance */}
                        <ComparisonRow
                            label="Performance Score"
                            baseValue={
                                baseDeployment.performanceMetrics ? (
                                    <span className={getScoreColor(baseDeployment.performanceMetrics.performanceScore)}>
                                        {Math.round(baseDeployment.performanceMetrics.performanceScore * 100)}
                                    </span>
                                ) : '-'
                            }
                            targetValue={
                                targetDeployment.performanceMetrics ? (
                                    <span className="flex items-center">
                                        <span className={getScoreColor(targetDeployment.performanceMetrics.performanceScore)}>
                                            {Math.round(targetDeployment.performanceMetrics.performanceScore * 100)}
                                        </span>
                                        {baseDeployment.performanceMetrics && renderMetricDiff(
                                            baseDeployment.performanceMetrics.performanceScore * 100,
                                            targetDeployment.performanceMetrics.performanceScore * 100,
                                            (v) => v.toFixed(0),
                                            false
                                        )}
                                    </span>
                                ) : '-'
                            }
                        />

                        {/* Core Web Vitals */}
                        {targetDeployment.performanceMetrics && (
                            <>
                                <ComparisonRow
                                    label="LCP (Largest Contentful Paint)"
                                    baseValue={baseDeployment.performanceMetrics ? `${baseDeployment.performanceMetrics.lcp.toFixed(0)}ms` : '-'}
                                    targetValue={
                                        <span className="flex items-center">
                                            {targetDeployment.performanceMetrics.lcp.toFixed(0)}ms
                                            {baseDeployment.performanceMetrics && renderMetricDiff(
                                                baseDeployment.performanceMetrics.lcp,
                                                targetDeployment.performanceMetrics.lcp,
                                                (v) => `${v.toFixed(0)}ms`,
                                                true
                                            )}
                                        </span>
                                    }
                                />
                                <ComparisonRow
                                    label="CLS (Cumulative Layout Shift)"
                                    baseValue={baseDeployment.performanceMetrics ? baseDeployment.performanceMetrics.cls.toFixed(3) : '-'}
                                    targetValue={
                                        <span className="flex items-center">
                                            {targetDeployment.performanceMetrics.cls.toFixed(3)}
                                            {baseDeployment.performanceMetrics && renderMetricDiff(
                                                baseDeployment.performanceMetrics.cls,
                                                targetDeployment.performanceMetrics.cls,
                                                (v) => v.toFixed(3),
                                                true
                                            )}
                                        </span>
                                    }
                                />
                            </>
                        )}
                    </div>
                </Card>
            )}
        </div>
    );
}

function DeploymentSummary({ deployment }: { deployment: Deployment }) {
    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h3 className="font-bold text-lg text-[var(--foreground)] truncate">{deployment.gitCommitMessage}</h3>
                    <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] mt-1">
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>{deployment.gitBranch}</span>
                        <span>•</span>
                        <span className="font-mono">{deployment.gitCommitSha.substring(0, 7)}</span>
                    </div>
                </div>
                <Badge variant={deployment.status === 'ready' ? 'success' : 'secondary'}>
                    {deployment.status}
                </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[var(--muted)]/5 rounded-xl border border-[var(--border)]/50 transition-colors hover:bg-[var(--muted)]/10">
                    <div className="text-[var(--muted-foreground)] text-[10px] font-bold uppercase tracking-widest mb-1">Created</div>
                    <div className="text-sm font-semibold">{new Date(deployment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                </div>
                 <div className="p-4 bg-[var(--muted)]/5 rounded-xl border border-[var(--border)]/50 transition-colors hover:bg-[var(--muted)]/10">
                    <div className="text-[var(--muted-foreground)] text-[10px] font-bold uppercase tracking-widest mb-1">Environment</div>
                    <div className="text-sm font-semibold capitalize">{deployment.type}</div>
                </div>
            </div>
        </div>
    );
}

function ComparisonRow({ label, baseValue, targetValue }: { label: string, baseValue: React.ReactNode, targetValue: React.ReactNode }) {
    return (
        <div className="grid grid-cols-3 px-6 py-4 items-center hover:bg-[var(--muted)]/5 transition-colors group">
            <div className="text-sm font-medium text-[var(--muted-foreground)]">{label}</div>
            <div className="text-sm font-mono font-medium">{baseValue}</div>
            <div className="text-sm font-mono font-semibold flex items-center gap-2">
                {targetValue}
                <ArrowRight className="w-3.5 h-3.5 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-20 transition-opacity ml-auto" />
            </div>
        </div>
    );
}
