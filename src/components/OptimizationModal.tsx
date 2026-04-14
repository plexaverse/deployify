'use client';

import {
    Sparkles,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    Zap,
    ShieldCheck,
    CheckCircle2,
    AlertCircle,
    X,
    ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import type { StorageConfig } from '@/types';
import type { ScalingRecommendation } from '@/lib/gcp/monitoring';

interface OptimizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    storage: StorageConfig | null;
    onApply?: (recommendation: ScalingRecommendation) => void;
}

export function OptimizationModal({ isOpen, onClose, storage, onApply }: OptimizationModalProps) {
    if (!storage || !storage.metadata?.optimization) return null;

    const optimization = storage.metadata.optimization as {
        recommendations: ScalingRecommendation[],
        lastAnalyzedAt: string
    };

    return (
        <ConfirmationModal
            isOpen={isOpen}
            onClose={onClose}
            title="Infrastructure Optimization"
            headerLabel="Intelligence Insight"
            icon={<Sparkles className="w-5 h-5 text-[var(--primary)]" />}
            description={
                <div className="space-y-6">
                    <div className="p-4 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-[var(--primary)]" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Scaling Analysis</span>
                            </div>
                            <span className="text-[9px] font-bold uppercase text-[var(--muted-foreground)]">
                                Analyzed: {new Date(optimization.lastAnalyzedAt).toLocaleTimeString()}
                            </span>
                        </div>
                        <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                            Based on real-time utilization trends, we&apos;ve identified opportunities to improve the performance and cost-efficiency of <strong>{storage.name}</strong>.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Available Recommendations</Label>
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
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--success)]/10 text-[var(--success)] uppercase">
                                                            Save {rec.estimatedSavings}
                                                        </span>
                                                    )}
                                                    {rec.performanceGain && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)] uppercase">
                                                            +{rec.performanceGain} Performance
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] font-bold text-[var(--foreground)] mt-1">{rec.reason}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-4 p-2.5 rounded-lg bg-[var(--muted)]/5 border border-[var(--border)]">
                                        <div className="space-y-0.5">
                                            <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] block">Current Tier</span>
                                            <span className="text-[10px] font-mono font-bold">{rec.currentTier}</span>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]/50" />
                                        <div className="text-right space-y-0.5">
                                            <span className="text-[8px] font-bold uppercase text-[var(--primary)] block">Recommended</span>
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
