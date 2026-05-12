'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Sparkles,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    Zap,
    HardDrive,
    AlertCircle,
    Moon,
    Clock,
    ShieldAlert,
    ShieldCheck,
    Lock,
    Search,
    Copy,
    GitPullRequest,
    Wrench,
    Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import type { StorageConfig, WorkloadShift, DeadlockReport } from '@/types';
import type { ScalingRecommendation, QueryImpactMetric, CachingRecommendation, PoolingRecommendation } from '@/lib/gcp/monitoring';
import type { SecurityPosture } from '@/lib/gcp/security-auditor';

interface OptimizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    storage: StorageConfig | null;
    projectId?: string;
    onApply?: (recommendation: ScalingRecommendation) => void;
}

export function OptimizationModal({ isOpen, onClose, storage, projectId, onApply }: OptimizationModalProps) {
    const [schemaOptimizations, setSchemaOptimizations] = useState<QueryImpactMetric[]>([]);
    const [cachingRecommendations, setCachingRecommendations] = useState<CachingRecommendation[]>([]);
    const [archivalReport, setArchivalReport] = useState<import('@/lib/gcp/monitoring').ArchivalReport | null>(null);
    const [deadlockReport, setDeadlockReport] = useState<DeadlockReport | null>(null);
    const [bloatReport, setBloatReport] = useState<import('@/lib/gcp/monitoring').BloatReport | null>(null);
    const [driftReport, setDriftReport] = useState<import('@/lib/gcp/monitoring').StatisticsDriftReport | null>(null);
    const [unusedIndexReport, setUnusedIndexReport] = useState<import('@/types').UnusedIndexReport | null>(null);
    const [applyingId, setApplyingId] = useState<string | null>(null);
    const [isRunningMaintenance, setIsRunningMaintenance] = useState<string | null>(null);
    const [activePoolingSnippet, setActivePoolingSnippet] = useState<string>('prisma');

    const fetchSchemaOptimizations = useCallback(async () => {
        if (!storage || !projectId) return;
        try {
            const res = await fetch(`/api/projects/${projectId}/storage/${storage.id}/optimization/schema`);
            const data = await res.json();
            if (data.success) {
                setSchemaOptimizations(data.recommendations || []);
            }
        } catch (e) {
            console.error('Failed to fetch schema optimizations:', e);
        }
    }, [storage, projectId]);

    const fetchCachingRecommendations = useCallback(async () => {
        if (!storage || !projectId) return;
        try {
            const res = await fetch(`/api/projects/${projectId}/storage/${storage.id}/optimization/caching`);
            const data = await res.json();
            if (data.success) {
                setCachingRecommendations(data.recommendations || []);
            }
        } catch (e) {
            console.error('Failed to fetch caching recommendations:', e);
        }
    }, [storage, projectId]);

    const fetchArchivalReport = useCallback(async () => {
        if (!storage || !projectId) return;
        try {
            const res = await fetch(`/api/projects/${projectId}/storage/${storage.id}/optimization/archival`);
            const data = await res.json();
            if (data.success) {
                setArchivalReport(data.report);
            }
        } catch (e) {
            console.error('Failed to fetch archival report:', e);
        }
    }, [storage, projectId]);

    const fetchBloatReport = useCallback(async () => {
        if (!storage || !projectId) return;
        try {
            const res = await fetch(`/api/projects/${projectId}/storage/${storage.id}/optimization/bloat`);
            const data = await res.json();
            if (data.success) {
                setBloatReport(data.report);
            }
        } catch (e) {
            console.error('Failed to fetch bloat report:', e);
        }
    }, [storage, projectId]);

    const fetchDriftReport = useCallback(async () => {
        if (!storage || !projectId) return;
        try {
            // We'll reuse the bloat API pattern for drift or assume it's in metadata if needed,
            // but for consistency with other advisors, we fetch it.
            // Note: Since we don't have a dedicated API route yet, we'll check if metadata has it.
            if (storage.metadata?.statisticsDrift) {
                setDriftReport(storage.metadata.statisticsDrift as import('@/lib/gcp/monitoring').StatisticsDriftReport);
            }
        } catch (e) {
            console.error('Failed to fetch drift report:', e);
        }
    }, [storage, projectId]);

    const fetchUnusedIndexReport = useCallback(async () => {
        if (!storage || !projectId) return;
        try {
            if (storage.unusedIndexReport) {
                setUnusedIndexReport(storage.unusedIndexReport);
            } else if (storage.metadata?.unusedIndexReport) {
                setUnusedIndexReport(storage.metadata.unusedIndexReport as import('@/types').UnusedIndexReport);
            }
        } catch (e) {
            console.error('Failed to fetch unused index report:', e);
        }
    }, [storage, projectId]);

    const fetchDeadlockReport = useCallback(async () => {
        if (!storage || !projectId) return;
        try {
            if (storage.deadlockReport) {
                setDeadlockReport(storage.deadlockReport);
            } else if (storage.metadata?.deadlockReport) {
                setDeadlockReport(storage.metadata.deadlockReport as DeadlockReport);
            }
        } catch (e) {
            console.error('Failed to fetch deadlock report:', e);
        }
    }, [storage, projectId]);

    useEffect(() => {
        if (isOpen && storage) {
            fetchSchemaOptimizations();
            fetchCachingRecommendations();
            fetchArchivalReport();
            fetchBloatReport();
            fetchDriftReport();
            fetchDeadlockReport();
            fetchUnusedIndexReport();
        }
    }, [isOpen, storage, fetchSchemaOptimizations, fetchCachingRecommendations, fetchArchivalReport, fetchBloatReport, fetchDriftReport, fetchDeadlockReport, fetchUnusedIndexReport]);

    const applyOptimization = async (recommendation: string, queryHash: string) => {
        if (!projectId || !storage) return;
        setApplyingId(queryHash);
        try {
            const res = await fetch(`/api/projects/${projectId}/storage/${storage.id}/optimization/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recommendation,
                    queryHash
                })
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Optimization Pull Request created!');
                if (data.pullRequestUrl) {
                    window.open(data.pullRequestUrl, '_blank');
                }
            } else {
                toast.error(data.error || 'Failed to create PR');
            }
        } catch (e) {
            toast.error('An unexpected error occurred');
            console.error(e);
        } finally {
            setApplyingId(null);
        }
    };

    const runMaintenance = async (entity: string, indexName: string, command: string) => {
        if (!projectId || !storage) return;
        setIsRunningMaintenance(`${entity}-${indexName}`);
        try {
            const res = await fetch(`/api/projects/${projectId}/storage/${storage.id}/maintenance/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entity,
                    indexName,
                    command
                })
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Maintenance operation triggered successfully');
                fetchBloatReport(); // Refresh report
                fetchDriftReport();
            } else {
                toast.error(data.error || 'Failed to trigger maintenance');
            }
        } catch (e) {
            toast.error('An unexpected error occurred');
            console.error(e);
        } finally {
            setIsRunningMaintenance(null);
        }
    };

    if (!storage || (!storage.metadata?.optimization && !schemaOptimizations.length && !cachingRecommendations.length && !bloatReport?.hasBloat && !driftReport?.hasDrift && !storage.metadata?.poolingRecommendation && !deadlockReport?.hasDeadlocks && !unusedIndexReport?.hasUnusedIndexes)) return null;

    const optimization = storage.metadata?.optimization as {
        recommendations: ScalingRecommendation[],
        lastAnalyzedAt: string
    } | undefined;

    const security = storage.metadata?.security as SecurityPosture | undefined;
    const dormancy = storage.dormancy;
    const workloadShift = storage.metadata?.workloadShift as unknown as WorkloadShift;
    const health = storage.metadata?.health as {
        status: string,
        predictedLatency?: number,
        isPredictiveDegraded?: boolean,
        jitterScore?: number
    } | undefined;

    const poolingRecommendation = storage.metadata?.poolingRecommendation as PoolingRecommendation | undefined;
    const costForecast = storage.metadata?.costForecast as { month: string; cost: number }[] | undefined;

    return (
        <ConfirmationModal
            isOpen={isOpen}
            onClose={onClose}
            title="Infrastructure Optimization"
            headerLabel="Intelligence Insight"
            icon={<Sparkles className="w-5 h-5 text-[var(--primary)]" />}
            description={
                <div className="space-y-6">
                    {health?.isPredictiveDegraded && (
                        <div className="p-4 bg-[var(--error)]/5 border border-[var(--error)]/30 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[var(--error)]">
                                    <TrendingUp className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Predictive Latency Anomaly</span>
                                </div>
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--error)]/20 text-[var(--error)]">
                                    Risk Detected
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-[var(--foreground)]">
                                Connectivity trend analysis predicts a significant latency increase ({health.predictedLatency}ms) within the next 24 hours.
                            </p>
                            <div className="p-2.5 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase text-[var(--error)]">Jitter Score</span>
                                    <span className="text-[10px] font-mono font-bold text-[var(--error)]">{(health.jitterScore || 0).toFixed(3)}</span>
                                </div>
                                <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] leading-relaxed">
                                    RECOMMENDATION: Consider a regional migration to a lower-jitter GCP region to stabilize connection performance.
                                </p>
                            </div>
                        </div>
                    )}

                    {workloadShift?.shifted && (
                        <div className="p-4 bg-[var(--warning)]/5 border border-[var(--warning)]/30 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[var(--warning)]">
                                    <TrendingUp className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Active Workload Shift Detected</span>
                                </div>
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--warning)]/20 text-[var(--warning)]">
                                    {new Date(workloadShift.detectedAt).toLocaleDateString()}
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-[var(--foreground)]">{workloadShift.reason}</p>
                            <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] leading-relaxed">
                                RECOMMENDATION: {workloadShift.recommendation}
                            </p>
                        </div>
                    )}

                    {security && (
                        <div className={cn(
                            "p-4 rounded-xl border space-y-4 animate-in fade-in slide-in-from-top-2",
                            security.score >= 90 ? "bg-[var(--success)]/5 border-[var(--success)]/20" : "bg-[var(--error)]/5 border-[var(--error)]/20"
                        )}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {security.score >= 90 ? (
                                        <ShieldCheck className="w-4 h-4 text-[var(--success)]" />
                                    ) : (
                                        <ShieldAlert className="w-4 h-4 text-[var(--error)]" />
                                    )}
                                    <span className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider",
                                        security.score >= 90 ? "text-[var(--success)]" : "text-[var(--error)]"
                                    )}>Security Posture: Grade {security.grade}</span>
                                </div>
                                <span className="text-[10px] font-mono font-bold">{security.score}/100</span>
                            </div>

                            {security.risks.length > 0 ? (
                                <div className="space-y-3">
                                    {security.risks.map((risk, i) => (
                                        <div key={i} className="p-3 bg-[var(--card)]/50 rounded-lg border border-[var(--border)] space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-[10px] font-bold uppercase px-1 rounded",
                                                        risk.level === 'critical' || risk.level === 'high' ? "bg-[var(--error)]/20 text-[var(--error)]" : "bg-[var(--warning)]/20 text-[var(--warning)]"
                                                    )}>{risk.level}</span>
                                                    <span className="text-[10px] font-bold uppercase">{risk.title}</span>
                                                </div>
                                            </div>
                                            <p className="text-[10px] font-bold text-[var(--muted-foreground)] leading-relaxed">{risk.description}</p>
                                            <div className="flex items-start gap-2 pt-1 border-t border-[var(--border)] mt-1">
                                                <Lock className="w-3 h-3 text-[var(--primary)] shrink-0 mt-0.5" />
                                                <p className="text-[10px] font-bold text-[var(--foreground)] uppercase">Remediation: {risk.remediation}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[10px] font-bold uppercase text-[var(--success)]/70 flex items-center gap-2">
                                    <ShieldCheck className="w-3 h-3" />
                                    No immediate security risks detected for this connector.
                                </p>
                            )}
                        </div>
                    )}

                    {optimization && (
                        <div className="p-4 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-[var(--primary)]" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Scaling Analysis</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    {storage.workloadProfile && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20">
                                            <span className="text-[10px] font-bold uppercase text-[var(--primary)]">{storage.workloadProfile.type}</span>
                                            <span className="text-[10px] font-mono opacity-60 text-[var(--primary)]">{Math.round(storage.workloadProfile.confidence * 100)}% CONF</span>
                                        </div>
                                    )}
                                    <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
                                        Analyzed: {new Date(optimization.lastAnalyzedAt).toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                            <p className="text-[10px] font-bold leading-relaxed text-[var(--muted-foreground)]">
                                Based on real-time utilization trends, we&apos;ve identified opportunities to improve the performance and cost-efficiency of <strong>{storage.name}</strong>.
                            </p>

                            {costForecast && (
                                <div className="space-y-3 pt-2">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-3.5 h-3.5 text-[var(--primary)]" />
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">3-Month Cost Forecast</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {costForecast.map((f, i) => (
                                            <div key={i} className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">{f.month}</span>
                                                <span className="text-[10px] font-mono font-bold">${f.cost.toFixed(0)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {dormancy?.isDormant && (
                        <div className="p-4 bg-[var(--muted)]/5 border border-[var(--border)] rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                                    <Moon className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Resource Dormancy Detected</span>
                                </div>
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--muted)]/20 text-[var(--muted-foreground)]">
                                    {dormancy.analysisPeriodDays}D ANALYSIS
                                </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Avg CPU</span>
                                    <span className="text-[10px] font-mono font-bold">{dormancy.avgCpuUtilization}%</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Avg Memory</span>
                                    <span className="text-[10px] font-mono font-bold">{dormancy.avgMemoryUtilization}%</span>
                                </div>
                                {dormancy.lastActiveAt && (
                                    <div className="space-y-1 col-span-2 md:col-span-1">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-[var(--muted-foreground)]" />
                                            <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Last Activity</span>
                                        </div>
                                        <span className="text-[10px] font-mono font-bold uppercase">{new Date(dormancy.lastActiveAt).toLocaleDateString()}</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]/70 leading-relaxed italic">
                                This resource shows near-zero activity. Consider downgrading to the minimum tier or archiving data to reduce costs.
                            </p>
                        </div>
                    )}

                    {cachingRecommendations.length > 0 && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Cache Advisor (Phase 145)</Label>
                            <div className="space-y-3">
                                {cachingRecommendations.map((cache, i) => (
                                    <div key={i} className="p-4 border border-[var(--info)]/20 rounded-xl bg-[var(--info)]/5 space-y-3 group hover:border-[var(--info)]/40 transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[var(--info)]/10 flex items-center justify-center shrink-0">
                                                    <Zap className="w-4 h-4 text-[var(--info)]" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--info)]">Caching Opportunity</span>
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--success)]/10 text-[var(--success)] uppercase">
                                                            {cache.projectedLatencyReductionMs}ms Saved
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-mono font-bold text-[var(--foreground)] line-clamp-1 group-hover:line-clamp-none transition-all">{cache.queryHash}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Suggested TTL</span>
                                                <span className="text-[10px] font-mono font-bold text-[var(--info)]">{cache.suggestedTtlSeconds}s</span>
                                            </div>
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Frequency</span>
                                                <span className="text-[10px] font-mono font-bold">{cache.frequencyPerMinute} req/min</span>
                                            </div>
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Impact</span>
                                                <span className="text-[10px] font-mono font-bold text-[var(--primary)]">{Math.round(cache.impactScore / 1000)}k</span>
                                            </div>
                                        </div>

                                        <p className="text-[10px] font-bold text-[var(--muted-foreground)] px-1">{cache.reason}</p>

                                        {cache.implementationSnippet && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Implementation Snippet</span>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5 text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(cache.implementationSnippet!);
                                                                toast.success('Snippet copied to clipboard');
                                                            }}
                                                        >
                                                            <Copy className="w-3 h-3" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            disabled={applyingId === cache.queryHash}
                                                            className="h-5 w-5 text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                                            onClick={() => applyOptimization(cache.implementationSnippet!, cache.queryHash)}
                                                        >
                                                            <GitPullRequest className={cn("w-3 h-3", applyingId === cache.queryHash && "animate-pulse")} />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="p-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg font-mono text-[10px] font-bold text-[var(--foreground)]/80 overflow-x-auto whitespace-pre">
                                                    {cache.implementationSnippet}
                                                </div>
                                                <Button
                                                    onClick={() => applyOptimization(cache.implementationSnippet!, cache.queryHash)}
                                                    disabled={applyingId === cache.queryHash}
                                                    className="w-full h-7 text-[10px] font-bold uppercase tracking-wider bg-[var(--info)]/10 text-[var(--info)] hover:bg-[var(--info)]/20 border border-[var(--info)]/20"
                                                >
                                                    {applyingId === cache.queryHash ? 'Creating PR...' : 'Create Caching PR'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Redis Provisioning Suggestion */}
                            {!storage.metadata?.hasRedisConnector && (
                                <div className="p-4 border border-[var(--warning)]/30 rounded-xl bg-[var(--warning)]/5 flex items-start gap-3 mt-4">
                                    <AlertCircle className="w-5 h-5 text-[var(--warning)] shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-[var(--warning)] uppercase">Redis Missing</p>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-relaxed">
                                            TO IMPLEMENT THIS CACHING STRATEGY, WE RECOMMEND PROVISIONING A GCP MEMORYSTORE (REDIS) CONNECTOR.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {(bloatReport?.hasBloat || driftReport?.hasDrift) && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Maintenance Advisor (Phase 149/151)</Label>
                            <div className="space-y-3">
                                {bloatReport?.candidates.map((candidate, i) => (
                                    <div key={`bloat-${i}`} className="p-4 border border-[var(--primary)]/20 rounded-xl bg-[var(--primary)]/5 space-y-3 group hover:border-[var(--primary)]/40 transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                                    <Wrench className="w-4 h-4 text-[var(--primary)]" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Index Bloat Detected</span>
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--error)]/10 text-[var(--error)] uppercase">
                                                            {candidate.bloatPercentage}% Bloat
                                                        </span>
                                                        <span className={cn(
                                                            "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                                                            candidate.impactScore > 70 ? "bg-[var(--error)] text-[var(--primary-foreground)] animate-pulse" : "bg-[var(--warning)]/20 text-[var(--warning)]"
                                                        )}>
                                                            Impact: {candidate.impactScore}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-mono font-bold text-[var(--foreground)]">{candidate.indexName}</p>
                                                    <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Entity: {candidate.entity}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Total Size</span>
                                                <span className="text-[10px] font-mono font-bold">{candidate.totalSizeMb} MB</span>
                                            </div>
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Wasted Space</span>
                                                <span className="text-[10px] font-mono font-bold text-[var(--error)]">{candidate.bloatSizeMb} MB</span>
                                            </div>
                                        </div>

                                        <div className="p-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg font-mono text-[10px] font-bold text-[var(--foreground)]/80 overflow-x-auto">
                                            {candidate.recommendation}
                                        </div>

                                        <Button
                                            onClick={() => runMaintenance(candidate.entity, candidate.indexName, candidate.recommendation)}
                                            disabled={isRunningMaintenance === `${candidate.entity}-${candidate.indexName}`}
                                            className="w-full h-7 text-[10px] font-bold uppercase tracking-wider bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 border border-[var(--primary)]/20"
                                        >
                                            {isRunningMaintenance === `${candidate.entity}-${candidate.indexName}` ? 'Optimizing...' : 'Run Defragmentation'}
                                        </Button>
                                    </div>
                                ))}

                                {driftReport?.candidates.map((candidate, i) => (
                                    <div key={`drift-${i}`} className="p-4 border border-[var(--error)]/20 rounded-xl bg-[var(--error)]/5 space-y-3 group hover:border-[var(--error)]/40 transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[var(--error)]/10 flex items-center justify-center shrink-0">
                                                    <Activity className="w-4 h-4 text-[var(--error)]" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)]">Statistics Drift Detected</span>
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--error)]/10 text-[var(--error)] uppercase">
                                                            {candidate.driftPercentage}% Drift
                                                        </span>
                                                        <span className={cn(
                                                            "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                                                            candidate.impactScore > 70 ? "bg-[var(--error)] text-[var(--primary-foreground)] animate-pulse" : "bg-[var(--warning)]/20 text-[var(--warning)]"
                                                        )}>
                                                            Impact: {candidate.impactScore}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-mono font-bold text-[var(--foreground)]">{candidate.entity}</p>
                                                    <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Entity: {candidate.entity}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Metadata</span>
                                                <span className="text-[10px] font-mono font-bold">
                                                    {candidate.deadTuples !== undefined ? `${candidate.deadTuples} Dead Tuples` : `${candidate.modificationCount} Mod Count`}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Urgency</span>
                                                <span className={cn("text-[10px] font-mono font-bold", candidate.impactScore > 50 ? "text-[var(--error)]" : "text-[var(--warning)]")}>
                                                    {candidate.impactScore > 70 ? 'CRITICAL' : (candidate.impactScore > 30 ? 'HIGH' : 'MEDIUM')}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg font-mono text-[10px] font-bold text-[var(--foreground)]/80 overflow-x-auto">
                                            {candidate.recommendation}
                                        </div>

                                        <Button
                                            onClick={() => runMaintenance(candidate.entity, 'stats', candidate.recommendation)}
                                            disabled={isRunningMaintenance === `${candidate.entity}-stats`}
                                            className="w-full h-7 text-[10px] font-bold uppercase tracking-wider bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 border border-[var(--error)]/20"
                                        >
                                            {isRunningMaintenance === `${candidate.entity}-stats` ? 'Optimizing...' : 'Run Statistics Optimization'}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {unusedIndexReport?.hasUnusedIndexes && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Unused Index Advisor (Phase 154)</Label>
                            <div className="space-y-3">
                                {unusedIndexReport.candidates.map((candidate, i) => (
                                    <div key={i} className="p-4 border border-[var(--warning)]/20 rounded-xl bg-[var(--warning)]/5 space-y-3 group hover:border-[var(--warning)]/40 transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[var(--warning)]/10 flex items-center justify-center shrink-0">
                                                    <Search className="w-4 h-4 text-[var(--warning)]" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--warning)]">
                                                            {candidate.isRedundant ? 'Redundant Index' : 'Unused Index'}
                                                        </span>
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--error)]/10 text-[var(--error)] uppercase">
                                                            {candidate.sizeMb > 0 ? `${candidate.sizeMb} MB Wasted` : 'Zero Traffic'}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-mono font-bold text-[var(--foreground)]">{candidate.indexName}</p>
                                                    <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Entity: {candidate.entity}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <p className="text-[10px] font-bold text-[var(--muted-foreground)] px-1">{candidate.reason}</p>

                                        {candidate.isRedundant && candidate.redundantWith && (
                                            <div className="p-2.5 bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-lg flex items-center gap-2">
                                                <AlertCircle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
                                                <p className="text-[10px] font-bold uppercase text-[var(--foreground)]">Redundant with: <span className="font-mono text-[var(--primary)]">{candidate.redundantWith}</span></p>
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                className="flex-1 h-7 text-[10px] font-bold uppercase tracking-wider border-[var(--warning)]/20 text-[var(--warning)] hover:bg-[var(--warning)]/10"
                                                onClick={() => {
                                                    const sql = `DROP INDEX "${candidate.indexName}";`;
                                                    navigator.clipboard.writeText(sql);
                                                    toast.success('DROP INDEX SQL copied to clipboard');
                                                }}
                                            >
                                                Copy Drop SQL
                                            </Button>
                                            <Button
                                                className="flex-1 h-7 text-[10px] font-bold uppercase tracking-wider bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 border border-[var(--primary)]/20"
                                                onClick={() => {
                                                    const sql = `DROP INDEX "${candidate.indexName}";`;
                                                    applyOptimization(sql, `drop-index-${candidate.indexName}`);
                                                }}
                                            >
                                                Create Drop PR
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {deadlockReport?.hasDeadlocks && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Deadlock Advisor (Phase 152)</Label>
                            <div className="space-y-3">
                                {deadlockReport.incidents.map((incident, i) => (
                                    <div key={i} className="p-4 border border-[var(--error)]/20 rounded-xl bg-[var(--error)]/5 space-y-3 group hover:border-[var(--error)]/40 transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[var(--error)]/10 flex items-center justify-center shrink-0">
                                                    <Lock className="w-4 h-4 text-[var(--error)]" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)]">Transaction Deadlock</span>
                                                        <span className={cn(
                                                            "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                                                            incident.impactScore > 70 ? "bg-[var(--error)] text-[var(--primary-foreground)] animate-pulse" : "bg-[var(--warning)]/20 text-[var(--warning)]"
                                                        )}>
                                                            Impact: {incident.impactScore}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-[var(--muted-foreground)]">Detected At: {new Date(incident.detectedAt).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Affected Queries</span>
                                            {incident.queries.map((q, qi) => (
                                                <div key={qi} className="p-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg font-mono text-[10px] font-bold text-[var(--foreground)]/80 overflow-x-auto whitespace-pre">
                                                    {q}
                                                </div>
                                            ))}
                                        </div>

                                        <div className="p-3 bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-lg flex items-start gap-2">
                                            <ShieldAlert className="w-3.5 h-3.5 text-[var(--warning)] shrink-0 mt-0.5" />
                                            <p className="text-[10px] font-bold uppercase text-[var(--foreground)] leading-relaxed">
                                                REMEDIATION: {incident.remediation}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {poolingRecommendation && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Pooling Advisor (Phase 150)</Label>
                            <div className="p-4 border border-[var(--primary)]/20 rounded-xl bg-[var(--primary)]/5 space-y-4 group hover:border-[var(--primary)]/40 transition-all">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                            <Zap className="w-4 h-4 text-[var(--primary)]" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Connection Pool Opportunity</span>
                                                <span className={cn(
                                                    "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                                                    poolingRecommendation.impact === 'high' ? "bg-[var(--error)]/20 text-[var(--error)] animate-pulse" : "bg-[var(--success)]/10 text-[var(--success)]"
                                                )}>
                                                    {poolingRecommendation.impact} Impact
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-bold text-[var(--foreground)]">{poolingRecommendation.reason}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-1">
                                        <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Current Default</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono font-bold text-[var(--muted-foreground)]">MIN: {poolingRecommendation.currentMin}</span>
                                            <span className="text-[10px] font-mono font-bold text-[var(--muted-foreground)]">MAX: {poolingRecommendation.currentMax}</span>
                                        </div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/20 space-y-1">
                                        <span className="block text-[8px] font-bold uppercase text-[var(--primary)]">Recommended</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono font-bold text-[var(--primary)]">MIN: {poolingRecommendation.recommendedMin}</span>
                                            <span className="text-[10px] font-mono font-bold text-[var(--primary)]">MAX: {poolingRecommendation.recommendedMax}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex gap-1">
                                            {Object.keys(poolingRecommendation.implementationSnippets).map((key) => (
                                                <button
                                                    key={key}
                                                    onClick={() => setActivePoolingSnippet(key)}
                                                    className={cn(
                                                        "px-2 py-0.5 rounded text-[8px] font-bold uppercase border transition-all",
                                                        activePoolingSnippet === key
                                                            ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]"
                                                            : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--primary)]/50"
                                                    )}
                                                >
                                                    {key}
                                                </button>
                                            ))}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                            onClick={() => {
                                                const snippet = (poolingRecommendation.implementationSnippets as Record<string, string>)[activePoolingSnippet];
                                                if (snippet) {
                                                    navigator.clipboard.writeText(snippet);
                                                    toast.success('Snippet copied to clipboard');
                                                }
                                            }}
                                        >
                                            <Copy className="w-3 h-3" />
                                        </Button>
                                    </div>
                                    <div className="p-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg font-mono text-[10px] font-bold text-[var(--foreground)]/80 overflow-x-auto whitespace-pre">
                                        {(poolingRecommendation.implementationSnippets as Record<string, string>)[activePoolingSnippet] || '// No snippet available'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {archivalReport?.hasCandidates && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Archival Advisor (Phase 148)</Label>
                            <div className="space-y-3">
                                {archivalReport.candidates.map((candidate, i) => (
                                    <div key={i} className="p-4 border border-[var(--warning)]/20 rounded-xl bg-[var(--warning)]/5 space-y-3 group hover:border-[var(--warning)]/40 transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[var(--warning)]/10 flex items-center justify-center shrink-0">
                                                    <HardDrive className="w-4 h-4 text-[var(--warning)]" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--warning)]">Archival Candidate</span>
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--success)]/10 text-[var(--success)] uppercase">
                                                            ${candidate.potentialSavingsMonthly}/mo savings
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-mono font-bold text-[var(--foreground)]">{candidate.entity}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Table Size</span>
                                                <span className="text-[10px] font-mono font-bold text-[var(--error)]">{candidate.sizeGb} GB</span>
                                            </div>
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Row Count</span>
                                                <span className="text-[10px] font-mono font-bold">{candidate.rowCount?.toLocaleString()} rows</span>
                                            </div>
                                        </div>

                                        <p className="text-[10px] font-bold text-[var(--muted-foreground)] px-1">{candidate.reason}</p>

                                        <Button
                                            variant="outline"
                                            className="w-full h-7 text-[10px] font-bold uppercase tracking-wider border-[var(--warning)]/20 text-[var(--warning)] hover:bg-[var(--warning)]/10"
                                            onClick={() => {
                                                window.open('https://cloud.google.com/sql/docs/postgres/import-export/export-data', '_blank');
                                                toast.info('Opening GCP documentation for SQL to GCS export');
                                            }}
                                        >
                                            View Archival Guide
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {schemaOptimizations.length > 0 && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Index Advisor (Telemetry-Driven)</Label>
                            <div className="space-y-3">
                                {schemaOptimizations.map((opt, i) => (
                                    <div key={i} className="p-4 border border-[var(--primary)]/20 rounded-xl bg-[var(--primary)]/5 space-y-3 group hover:border-[var(--primary)]/40 transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                                    <Search className="w-4 h-4 text-[var(--primary)]" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Missing Index Detected</span>
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--success)]/10 text-[var(--success)] uppercase">
                                                            High Impact
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-mono font-bold text-[var(--foreground)] line-clamp-1 group-hover:line-clamp-none transition-all">{opt.queryHash}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Avg Latency</span>
                                                <span className="text-[10px] font-mono font-bold text-[var(--error)]">{opt.avgLatency}ms</span>
                                            </div>
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Frequency</span>
                                                <span className="text-[10px] font-mono font-bold">{opt.requestCount} Reqs/24H</span>
                                            </div>
                                            <div className="p-2 rounded bg-[var(--card)] border border-[var(--border)]">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-0.5">Impact Score</span>
                                                <span className="text-[10px] font-mono font-bold text-[var(--primary)]">{Math.round(opt.impactScore / 1000)}k</span>
                                            </div>
                                        </div>

                                        {opt.recommendation && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Proposed Optimization</span>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5 text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(opt.recommendation!);
                                                                toast.success('SQL copied to clipboard');
                                                            }}
                                                        >
                                                            <Copy className="w-3 h-3" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            disabled={applyingId === opt.queryHash}
                                                            className="h-5 w-5 text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                                            onClick={() => applyOptimization(opt.recommendation!, opt.queryHash)}
                                                        >
                                                            <GitPullRequest className={cn("w-3 h-3", applyingId === opt.queryHash && "animate-pulse")} />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="p-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg font-mono text-[10px] font-bold text-[var(--primary)]">
                                                    {opt.recommendation}
                                                </div>
                                                <Button
                                                    onClick={() => applyOptimization(opt.recommendation!, opt.queryHash)}
                                                    disabled={applyingId === opt.queryHash}
                                                    className="w-full h-7 text-[10px] font-bold uppercase tracking-wider bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 border border-[var(--primary)]/20"
                                                >
                                                    {applyingId === opt.queryHash ? 'Creating PR...' : 'Create Optimization PR'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {optimization && (
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Scaling Recommendations</Label>
                            <div className="space-y-3">
                                {optimization.recommendations.map((rec, i) => (
                                <div key={i} className="p-4 border border-[var(--border)] rounded-xl bg-[var(--background)] space-y-4 group hover:border-[var(--primary)]/30 transition-all">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                                rec.type === 'upgrade' ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--primary)]/10 text-[var(--primary)]"
                                            )}>
                                                {rec.type === 'upgrade' ? <Zap className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">
                                                        {rec.type.toUpperCase()} {rec.resource.toUpperCase()}
                                                    </span>
                                                    {rec.estimatedSavings && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--success)]/10 text-[var(--success)] uppercase">
                                                            Save {rec.estimatedSavings}
                                                        </span>
                                                    )}
                                                    {rec.performanceGain && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)] uppercase">
                                                            +{rec.performanceGain} Performance
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] font-bold text-[var(--foreground)] mt-1">{rec.reason}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-4 p-2.5 rounded-lg bg-[var(--muted)]/5 border border-[var(--border)]">
                                        <div className="space-y-0.5">
                                            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] block">Current Tier</span>
                                            <span className="text-[10px] font-mono font-bold">{rec.currentTier}</span>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]/50" />
                                        <div className="text-right space-y-0.5">
                                            <span className="text-[10px] font-bold uppercase text-[var(--primary)] block">Recommended</span>
                                            <span className="text-[10px] font-mono font-bold text-[var(--primary)]">{rec.recommendedTier}</span>
                                        </div>
                                    </div>

                                    {onApply && (
                                        <Button
                                            onClick={() => onApply(rec)}
                                            className="w-full h-8 text-[10px] font-bold uppercase tracking-wider bg-[var(--primary)]"
                                        >
                                            Apply Recommendation
                                        </Button>
                                    )}
                                </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex items-start gap-3 p-4 bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-xl">
                        <AlertCircle className="w-4 h-4 text-[var(--info)] shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-relaxed">
                            Applying these changes will trigger a GCP update operation. Your database may experience brief unavailability depending on the tier adjustment.
                        </p>
                    </div>
                </div>
            }
            showConfirm={false}
            showCancel={false}
        />
    );
}
