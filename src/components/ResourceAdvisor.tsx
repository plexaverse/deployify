'use client';

import React, { useEffect, useState } from 'react';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { TrendingDown, TrendingUp, Zap, DollarSign, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Recommendation {
    type: 'upgrade' | 'downgrade' | 'optimize';
    resource: 'cpu' | 'memory' | 'disk';
    currentTier: string;
    recommendedTier: string;
    reason: string;
    estimatedSavings?: string;
    performanceGain?: string;
}

interface StorageRecommendation {
    storageId: string;
    storageName: string;
    recommendations: Recommendation[];
    metrics: {
        cpuUtilization: number;
        memoryUtilization: number;
        diskUtilization: number;
    };
}

export const ResourceAdvisor = ({ projectId }: { projectId: string }) => {
    const [recommendations, setRecommendations] = useState<StorageRecommendation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRecommendations = async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/recommendations`);
                const data = await res.json();
                if (data.success) {
                    setRecommendations(data.recommendations);
                }
            } catch (error) {
                console.error('Failed to fetch recommendations:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchRecommendations();
    }, [projectId]);

    const handleApply = async (storageId: string, rec: Recommendation) => {
        toast.promise(
            fetch(`/api/projects/${projectId}/storage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storageId,
                    metadata: {
                        tier: rec.recommendedTier
                    }
                }),
            }),
            {
                loading: 'Applying recommendation...',
                success: 'Recommendation applied successfully',
                error: 'Failed to apply recommendation',
            }
        );
    };

    if (loading) {
        return <div className="animate-pulse flex flex-col space-y-4">
            <div className="h-8 bg-[var(--card)] rounded w-1/4"></div>
            <div className="grid grid-cols-3 gap-6">
                {[1, 2, 3].map(i => <div key={i} className="h-48 bg-[var(--card)] rounded-3xl"></div>)}
            </div>
        </div>;
    }

    if (recommendations.length === 0) {
        return (
            <div className="p-8 rounded-3xl border border-dashed border-[var(--border)] flex flex-col items-center justify-center text-center backdrop-blur-xl">
                <BarChart3 className="w-12 h-12 text-[var(--muted-foreground)]/50 mb-4" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">All optimized</h3>
                <p className="text-[var(--muted-foreground)] mt-1 max-w-xs uppercase tracking-[0.2em] text-[8px]">
                    Your resources are currently aligned with your usage patterns. Check back in 7 days.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em]">Resource Advisor</h2>
                <div className="flex items-center space-x-2 text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                    <Zap className="w-3 h-3 text-[var(--warning)]" />
                    <span>Powered by Intelligent Insights</span>
                </div>
            </div>

            <BentoGrid>
                {recommendations.flatMap((storage) =>
                    storage.recommendations.map((rec, idx) => (
                        <BentoGridItem
                            key={`${storage.storageId}-${idx}`}
                            title={
                                <div className="flex items-center justify-between">
                                    <span>{storage.storageName}</span>
                                    <span className={rec.type === 'downgrade' ? 'text-[var(--success)]' : 'text-[var(--info)]'}>
                                        {rec.type === 'downgrade' ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                                    </span>
                                </div>
                            }
                            description={rec.reason}
                            header={
                                <div className="flex flex-col space-y-2">
                                    <div className="flex justify-between items-end">
                                        <div className="text-[8px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Current Tier</div>
                                        <div className="text-[10px] font-mono">{rec.currentTier}</div>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <div className="text-[8px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Recommended</div>
                                        <div className="text-[10px] font-mono text-[var(--foreground)]">{rec.recommendedTier}</div>
                                    </div>
                                    <div className="mt-4 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
                                        <div className="flex items-center space-x-2">
                                            {rec.type === 'downgrade' ? (
                                                <>
                                                    <DollarSign className="w-4 h-4 text-[var(--success)]" />
                                                    <span className="text-[10px] font-bold text-[var(--success)]">Save {rec.estimatedSavings} / mo</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Zap className="w-4 h-4 text-[var(--info)]" />
                                                    <span className="text-[10px] font-bold text-[var(--info)]">{rec.performanceGain} Performance Boost</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-4 w-full rounded-xl text-[8px] uppercase tracking-[0.2em] font-bold"
                                        onClick={() => handleApply(storage.storageId, rec)}
                                    >
                                        Apply Optimization
                                    </Button>
                                </div>
                            }
                            icon={<BarChart3 className="w-4 h-4 text-[var(--muted-foreground)]/80" />}
                        />
                    ))
                )}
            </BentoGrid>
        </div>
    );
};
