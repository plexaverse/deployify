import React from 'react';
import { LighthouseMetrics } from '@/types';
import { Zap, MousePointerClick, Layout, Activity } from 'lucide-react';
import { getLCPStatus, getFIDStatus, getCLSStatus, getScoreStatus } from '@/lib/performance/thresholds';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const variantMap: Record<string, 'success' | 'warning' | 'error' | 'secondary'> = {
    good: 'success',
    average: 'warning',
    poor: 'error',
};

interface WebVitalsProps {
    metrics?: LighthouseMetrics | null;
    isCompact?: boolean;
}

export function WebVitals({ metrics, isCompact }: WebVitalsProps) {
    if (!metrics) {
        return null;
    }

    // Default to 0 or null to prevent crashes on incomplete data
    const lcp = metrics.lcp ?? 0;
    const fid = metrics.fid ?? null;
    const cls = metrics.cls ?? 0;
    const performanceScore = metrics.performanceScore ?? 0;

    const stats = [
        {
            label: 'Performance',
            value: Math.round(performanceScore * 100),
            unit: '',
            status: getScoreStatus(performanceScore),
            icon: Activity,
            description: 'Overall Score'
        },
        {
            label: 'LCP',
            value: Math.round(lcp),
            unit: 'ms',
            status: getLCPStatus(lcp),
            icon: Zap,
            description: 'Largest Contentful Paint'
        },
        {
            label: 'FID',
            value: fid !== null ? Math.round(fid) : 'N/A',
            unit: fid !== null ? 'ms' : '',
            status: fid !== null ? getFIDStatus(fid) : 'average',
            icon: MousePointerClick,
            description: 'First Input Delay'
        },
        {
            label: 'CLS',
            value: cls.toFixed(3),
            unit: '',
            status: getCLSStatus(cls),
            icon: Layout,
            description: 'Cumulative Layout Shift'
        }
    ];

    if (isCompact) {
        return (
            <div className="grid grid-cols-1 gap-4">
                {stats.map((stat) => {
                    const variant = variantMap[stat.status as string] || 'secondary';
                    return (
                        <div key={stat.label} className="p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--muted-foreground)]">{stat.label}</span>
                                <stat.icon className={cn("w-3.5 h-3.5", {
                                    "text-[var(--success)]": variant === 'success',
                                    "text-[var(--warning)]": variant === 'warning',
                                    "text-[var(--error)]": variant === 'error',
                                })} />
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className={cn("text-lg font-semibold", {
                                    "text-[var(--success)]": variant === 'success',
                                    "text-[var(--warning)]": variant === 'warning',
                                    "text-[var(--error)]": variant === 'error',
                                })}>
                                    {stat.value}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">{stat.unit}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <Card className="overflow-hidden p-0 shadow-sm">
            <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Activity className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Performance</span>
                        <h3 className="text-xl font-semibold">Core Web Vitals</h3>
                    </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider px-2">
                    Real-time Data
                </Badge>
            </div>

            <Separator className="bg-[var(--border)]" />

            <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {stats.map((stat) => {
                        const variant = variantMap[stat.status as string] || 'secondary';
                        return (
                            <div key={stat.label} className="p-4 rounded-xl bg-[var(--muted)]/5 border border-[var(--border)] group hover:border-[var(--primary)] transition-all duration-300">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">{stat.label}</span>
                                    <stat.icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", {
                                        "text-[var(--success)]": variant === 'success',
                                        "text-[var(--warning)]": variant === 'warning',
                                        "text-[var(--error)]": variant === 'error',
                                    })} />
                                </div>
                                <div className="flex items-baseline gap-1.5 mb-3">
                                    <span className={cn("text-2xl font-semibold tracking-tight", {
                                        "text-[var(--success)]": variant === 'success',
                                        "text-[var(--warning)]": variant === 'warning',
                                        "text-[var(--error)]": variant === 'error',
                                    })}>
                                        {stat.value}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">{stat.unit}</span>
                                </div>
                                <Badge
                                    variant={variant}
                                    className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5"
                                >
                                    {stat.status.toUpperCase()}
                                </Badge>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}
