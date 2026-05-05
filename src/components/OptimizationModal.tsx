'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Sparkles,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    Zap,
    AlertCircle,
    Moon,
    Clock,
    ShieldAlert,
    ShieldCheck,
    Lock,
    Search,
    Loader2,
    CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import type { StorageConfig, WorkloadShift, IndexRecommendation } from '@/types';
import type { ScalingRecommendation } from '@/lib/gcp/monitoring';
import type { SecurityPosture } from '@/lib/gcp/security-auditor';

interface OptimizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    storage: StorageConfig | null;
    onApply?: (recommendation: ScalingRecommendation) => void;
}

interface IndexRec extends IndexRecommendation {
    isApplied?: boolean;
}

export function OptimizationModal({ isOpen, onClose, storage, onApply }: OptimizationModalProps) {
    const [indexRecs, setIndexRecs] = useState<IndexRec[]>([]);
    const [isLoadingRecs, setIsLoadingRecs] = useState(false);
    const [applyingIndex, setApplyingIndex] = useState<string | null>(null);

    const fetchIndexRecommendations = useCallback(async () => {
        if (!storage) return;
        setIsLoadingRecs(true);
        try {
            const res = await fetch(`/api/projects/${storage.providerProjectId || 'current'}/storage/${storage.id}/schema-optimization`);
            const data = await res.json();
            if (data.success) {
                setIndexRecs(data.recommendations || []);
            }
        } catch (e) {
            console.error('Failed to fetch index recs:', e);
        } finally {
            setIsLoadingRecs(false);
        }
    }, [storage]);

    useEffect(() => {
        if (isOpen && storage && (storage.type.includes('sql') || storage.type === 'supabase' || storage.type === 'planetscale')) {
            fetchIndexRecommendations();
        }
    }, [isOpen, storage, fetchIndexRecommendations]);

    const handleApplyIndex = async (rec: IndexRec) => {
        if (!storage) return;
        setApplyingIndex(rec.indexName);
        try {
            const res = await fetch(`/api/projects/${storage.providerProjectId || 'current'}/storage/${storage.id}/apply-index`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: rec.table,
                    column: rec.column,
                    indexName: rec.indexName,
                    customSql: rec.suggestedSql
                })
            });
            const data = await res.json();
            if (data.success) {
                setIndexRecs(prev => prev.map(r => r.indexName === rec.indexName ? { ...r, isApplied: true } : r));
            }
        } catch (e) {
            console.error('Failed to apply index:', e);
        } finally {
            setApplyingIndex(null);
        }
    };

    if (!storage || !storage.metadata?.optimization) return null;

    const optimization = storage.metadata.optimization as {
        recommendations: ScalingRecommendation[],
        lastAnalyzedAt: string
    } | undefined;

    const security = storage.metadata.security as SecurityPosture | undefined;
    const dormancy = storage.dormancy;
    const workloadShift = storage.metadata.workloadShift as unknown as WorkloadShift;
    const health = storage.metadata.health as {
        status: string,
        predictedLatency?: number,
        isPredictiveDegraded?: boolean,
        jitterScore?: number
    } | undefined;

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
                                    <span className="text-[8px] font-bold uppercase tracking-wider">Predictive Latency Anomaly</span>
                                </div>
                                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--error)]/20 text-[var(--error)]">
                                    Risk Detected
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-[var(--foreground)]">
                                Connectivity trend analysis predicts a significant latency increase ({health.predictedLatency}ms) within the next 24 hours.
                            </p>
                            <div className="p-2.5 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-bold uppercase text-[var(--error)]">Jitter Score</span>
                                    <span className="text-[8px] font-mono font-bold text-[var(--error)]">{(health.jitterScore || 0).toFixed(3)}</span>
                                </div>
                                <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] leading-relaxed">
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
                                    <span className="text-[8px] font-bold uppercase tracking-wider">Active Workload Shift Detected</span>
                                </div>
                                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--warning)]/20 text-[var(--warning)]">
                                    {new Date(workloadShift.detectedAt).toLocaleDateString()}
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-[var(--foreground)]">{workloadShift.reason}</p>
                            <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] leading-relaxed">
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
                                        "text-[8px] font-bold uppercase tracking-wider",
                                        security.score >= 90 ? "text-[var(--success)]" : "text-[var(--error)]"
                                    )}>Security Posture: Grade {security.grade}</span>
                                </div>
                                <span className="text-[8px] font-mono font-bold">{security.score}/100</span>
                            </div>

                            {security.risks.length > 0 ? (
                                <div className="space-y-3">
                                    {security.risks.map((risk, i) => (
                                        <div key={i} className="p-3 bg-[var(--card)]/50 rounded-lg border border-[var(--border)] space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-[8px] font-bold uppercase px-1 rounded",
                                                        risk.level === 'critical' || risk.level === 'high' ? "bg-[var(--error)]/20 text-[var(--error)]" : "bg-[var(--warning)]/20 text-[var(--warning)]"
                                                    )}>{risk.level}</span>
                                                    <span className="text-[8px] font-bold uppercase">{risk.title}</span>
                                                </div>
                                            </div>
                                            <p className="text-[8px] text-[var(--muted-foreground)] leading-relaxed">{risk.description}</p>
                                            <div className="flex items-start gap-2 pt-1 border-t border-[var(--border)] mt-1">
                                                <Lock className="w-3 h-3 text-[var(--primary)] shrink-0 mt-0.5" />
                                                <p className="text-[8px] font-bold text-[var(--foreground)] uppercase">Remediation: {risk.remediation}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[8px] font-bold uppercase text-[var(--success)]/70 flex items-center gap-2">
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
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Scaling Analysis</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    {storage.workloadProfile && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20">
                                            <span className="text-[8px] font-bold uppercase text-[var(--primary)]">{storage.workloadProfile.type}</span>
                                            <span className="text-[8px] font-mono opacity-60 text-[var(--primary)]">{Math.round(storage.workloadProfile.confidence * 100)}% CONF</span>
                                        </div>
                                    )}
                                    <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">
                                        Analyzed: {new Date(optimization.lastAnalyzedAt).toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                            <p className="text-[10px] leading-relaxed text-[var(--muted-foreground)]">
                                Based on real-time utilization trends, we&apos;ve identified opportunities to improve the performance and cost-efficiency of <strong>{storage.name}</strong>.
                            </p>
                        </div>
                    )}

                    {dormancy?.isDormant && (
                        <div className="p-4 bg-[var(--muted)]/5 border border-[var(--border)] rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                                    <Moon className="w-4 h-4" />
                                    <span className="text-[8px] font-bold uppercase tracking-wider">Resource Dormancy Detected</span>
                                </div>
                                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--muted)]/20 text-[var(--muted-foreground)]">
                                    {dormancy.analysisPeriodDays}D ANALYSIS
                                </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Avg CPU</span>
                                    <span className="text-[8px] font-mono font-bold">{dormancy.avgCpuUtilization}%</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Avg Memory</span>
                                    <span className="text-[8px] font-mono font-bold">{dormancy.avgMemoryUtilization}%</span>
                                </div>
                                {dormancy.lastActiveAt && (
                                    <div className="space-y-1 col-span-2 md:col-span-1">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-[var(--muted-foreground)]" />
                                            <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Last Activity</span>
                                        </div>
                                        <span className="text-[8px] font-mono font-bold uppercase">{new Date(dormancy.lastActiveAt).toLocaleDateString()}</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]/70 leading-relaxed italic">
                                This resource shows near-zero activity. Consider downgrading to the minimum tier or archiving data to reduce costs.
                            </p>
                        </div>
                    )}

                    {indexRecs.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    Index Advisor (Phase 137)
                                </Label>
                                <div className="flex items-center gap-2">
                                    {isLoadingRecs && <Loader2 className="w-3 h-3 animate-spin text-[var(--primary)]" />}
                                    <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)]">
                                        Telemetry Driven
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {indexRecs.map((rec, i) => (
                                    <div key={i} className="p-4 border border-[var(--border)] rounded-xl bg-[var(--background)] space-y-3 group hover:border-[var(--primary)]/30 transition-all">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] shrink-0">
                                                    <Search className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[8px] font-bold uppercase tracking-wider">Missing Index: {rec.table}.{rec.column}</span>
                                                        <span className={cn(
                                                            "text-[8px] font-bold px-1.5 py-0.5 rounded uppercase",
                                                            rec.impactScore > 10000 ? "bg-[var(--error)]/10 text-[var(--error)]" : "bg-[var(--warning)]/10 text-[var(--warning)]"
                                                        )}>
                                                            Impact: {rec.impactScore.toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-[var(--foreground)] mt-1">{rec.reason}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-2.5 rounded-lg bg-[var(--muted)]/5 border border-[var(--border)]">
                                            <code className="text-[8px] font-mono text-[var(--muted-foreground)] block break-all">
                                                {rec.suggestedSql}
                                            </code>
                                        </div>

                                        <Button
                                            onClick={() => handleApplyIndex(rec)}
                                            disabled={rec.isApplied || applyingIndex === rec.indexName}
                                            className={cn(
                                                "w-full h-8 text-[8px] font-bold uppercase tracking-wider",
                                                rec.isApplied ? "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20" : ""
                                            )}
                                            variant={rec.isApplied ? "outline" : "primary"}
                                        >
                                            {rec.isApplied ? (
                                                <span className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Optimization Applied
                                                </span>
                                            ) : (
                                                applyingIndex === rec.indexName ? 'Applying Optimization...' : 'Apply Index Optimization'
                                            )}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {optimization && (
                        <div className="space-y-3">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Scaling Recommendations</Label>
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
                                                    <span className="text-[8px] font-bold uppercase tracking-wider">
                                                        {rec.type.toUpperCase()} {rec.resource.toUpperCase()}
                                                    </span>
                                                    {rec.estimatedSavings && (
                                                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[var(--success)]/10 text-[var(--success)] uppercase">
                                                            Save {rec.estimatedSavings}
                                                        </span>
                                                    )}
                                                    {rec.performanceGain && (
                                                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)] uppercase">
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
                                            <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] block">Current Tier</span>
                                            <span className="text-[8px] font-mono font-bold">{rec.currentTier}</span>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]/50" />
                                        <div className="text-right space-y-0.5">
                                            <span className="text-[8px] font-bold uppercase text-[var(--primary)] block">Recommended</span>
                                            <span className="text-[8px] font-mono font-bold text-[var(--primary)]">{rec.recommendedTier}</span>
                                        </div>
                                    </div>

                                    {onApply && (
                                        <Button
                                            onClick={() => onApply(rec)}
                                            className="w-full h-8 text-[8px] font-bold uppercase tracking-wider bg-[var(--primary)]"
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
                        <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-relaxed">
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
