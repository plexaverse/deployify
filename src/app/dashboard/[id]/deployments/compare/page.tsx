'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    GitBranch,
    ArrowRight,
    ArrowLeftRight,
    History,
    LayoutGrid
} from 'lucide-react';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import type { Deployment } from '@/types';

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

        if (isNeutral) return <span className="text-[var(--muted-foreground)] text-[10px] font-bold uppercase tracking-wider ml-2">No change</span>;

        return (
            <span className={cn("text-[10px] font-bold uppercase tracking-wider ml-2 flex items-center gap-0.5", isImprovement ? "text-[var(--success)]" : "text-[var(--error)]")}>
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
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            {/* Breadcrumb */}
            <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="group text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)] -ml-2 h-auto py-0"
            >
                <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                Back to Project
            </Button>

            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <ArrowLeftRight className="w-8 h-8 text-[var(--primary)]" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Performance Analysis</span>
                        <h1 className="text-[11px] md:text-xs font-bold tracking-tight">Compare Deployments</h1>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Base Deployment Selector */}
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <History className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Base Deployment</span>
                            <h3 className="text-xs font-bold">Previous Version</h3>
                        </div>
                    </div>
                    <Separator className="bg-[var(--border)]" />
                    <div className="p-6 space-y-6">
                        <div>
                            <label className="text-xs font-bold mb-3 block">Select Source</label>
                            <NativeSelect
                                value={baseId}
                                onChange={(e) => handleBaseChange(e.target.value)}
                            >
                                <option value="">SELECT DEPLOYMENT</option>
                                {currentDeployments.map(d => (
                                    <option key={d.id} value={d.id}>
                                        {d.gitCommitMessage.toUpperCase()} ({d.gitCommitSha.substring(0, 7).toUpperCase()})
                                    </option>
                                ))}
                            </NativeSelect>
                        </div>

                        {baseDeployment ? (
                            <DeploymentSummary deployment={baseDeployment} />
                        ) : (
                             <div className="h-48 flex items-center justify-center text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-lg text-xs font-bold">
                                Select a deployment
                            </div>
                        )}
                    </div>
                </Card>

                {/* Target Deployment Selector */}
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <ArrowRight className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Target Deployment</span>
                            <h3 className="text-xs font-bold">New Version</h3>
                        </div>
                    </div>
                    <Separator className="bg-[var(--border)]" />
                    <div className="p-6 space-y-6">
                        <div>
                            <label className="text-xs font-bold mb-3 block">Select Target</label>
                            <NativeSelect
                                value={targetId}
                                onChange={(e) => handleTargetChange(e.target.value)}
                            >
                                <option value="">SELECT DEPLOYMENT</option>
                                {currentDeployments.map(d => (
                                    <option key={d.id} value={d.id}>
                                        {d.gitCommitMessage.toUpperCase()} ({d.gitCommitSha.substring(0, 7).toUpperCase()})
                                    </option>
                                ))}
                            </NativeSelect>
                        </div>

                        {targetDeployment ? (
                            <DeploymentSummary deployment={targetDeployment} />
                        ) : (
                            <div className="h-48 flex items-center justify-center text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-lg text-xs font-bold">
                                Select a deployment
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Comparison Table */}
            {baseDeployment && targetDeployment && (
                <Card className="overflow-hidden p-0 border-[var(--border)] shadow-sm">
                    <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <LayoutGrid className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Performance Metrics</span>
                            <h3 className="text-xs font-bold">Comparison Results</h3>
                        </div>
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
                                    baseValue={baseDeployment.performanceMetrics?.lcp !== undefined ? `${baseDeployment.performanceMetrics.lcp.toFixed(0)}ms` : '-'}
                                    targetValue={
                                        <span className="flex items-center">
                                            {targetDeployment.performanceMetrics?.lcp !== undefined ? `${targetDeployment.performanceMetrics.lcp.toFixed(0)}ms` : '-'}
                                            {baseDeployment.performanceMetrics?.lcp !== undefined && targetDeployment.performanceMetrics?.lcp !== undefined && renderMetricDiff(
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
                                    baseValue={baseDeployment.performanceMetrics?.cls !== undefined ? baseDeployment.performanceMetrics.cls.toFixed(3) : '-'}
                                    targetValue={
                                        <span className="flex items-center">
                                            {targetDeployment.performanceMetrics?.cls !== undefined ? targetDeployment.performanceMetrics.cls.toFixed(3) : '-'}
                                            {baseDeployment.performanceMetrics?.cls !== undefined && targetDeployment.performanceMetrics?.cls !== undefined && renderMetricDiff(
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
                    <h3 className="text-xs font-bold text-[var(--foreground)] truncate">{deployment.gitCommitMessage}</h3>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mt-1">
                        <GitBranch className="w-3.5 h-3.5" />
                        <span className="font-mono text-[var(--foreground)]">{deployment.gitBranch}</span>
                        <span className="text-[var(--muted)]">•</span>
                        <span className="font-mono text-[var(--foreground)]">{deployment.gitCommitSha.substring(0, 7)}</span>
                    </div>
                </div>
                <Badge variant={deployment.status === 'ready' ? 'success' : 'secondary'} className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5">
                    {deployment.status.toUpperCase()}
                </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[var(--muted)]/5 rounded-xl border border-[var(--border)]/50 transition-colors hover:bg-[var(--muted)]/10">
                    <div className="text-[var(--muted-foreground)] text-[10px] font-bold uppercase tracking-wider mb-1">Created</div>
                    <div className="text-xs font-bold text-[var(--foreground)]">{new Date(deployment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</div>
                </div>
                 <div className="p-4 bg-[var(--muted)]/5 rounded-xl border border-[var(--border)]/50 transition-colors hover:bg-[var(--muted)]/10">
                    <div className="text-[var(--muted-foreground)] text-[10px] font-bold uppercase tracking-wider mb-1">Environment</div>
                    <div className="text-xs font-bold text-[var(--foreground)] uppercase">{deployment.type}</div>
                </div>
            </div>
        </div>
    );
}

function ComparisonRow({ label, baseValue, targetValue }: { label: string, baseValue: React.ReactNode, targetValue: React.ReactNode }) {
    return (
        <div className="grid grid-cols-3 px-6 py-4 items-center hover:bg-[var(--card-hover)] transition-colors group">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">{label}</div>
            <div className="text-xs font-mono font-bold">{baseValue}</div>
            <div className="text-xs font-mono font-bold flex items-center gap-2">
                {targetValue}
                <ArrowRight className="w-3.5 h-3.5 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-20 transition-opacity ml-auto" />
            </div>
        </div>
    );
}
