import React from 'react';
import { LighthouseMetrics } from '@/types';
import { Zap, MousePointerClick, Layout, Activity } from 'lucide-react';
import { getLCPStatus, getFIDStatus, getCLSStatus, getScoreStatus, MetricStatus } from '@/lib/performance/thresholds';

function getStatusColor(status: MetricStatus): string {
    switch (status) {
        case 'good':
            return 'text-[var(--success)]';
        case 'average':
            return 'text-[var(--warning)]';
        case 'poor':
            return 'text-[var(--error)]';
        default:
            return 'text-[var(--muted)]';
    }
}

function getStatusBg(status: MetricStatus): string {
    switch (status) {
        case 'good':
            return 'bg-[var(--success-bg)]';
        case 'average':
            return 'bg-[var(--warning-bg)]';
        case 'poor':
            return 'bg-[var(--error-bg)]';
        default:
            return 'bg-[var(--muted)]/10';
    }
}

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
                {stats.map((stat) => (
                    <div key={stat.label} className="p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--muted-foreground)]">{stat.label}</span>
                            <stat.icon className={`w-3.5 h-3.5 ${getStatusColor(stat.status as MetricStatus)}`} />
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className={`text-lg font-bold ${getStatusColor(stat.status as MetricStatus)}`}>
                                {stat.value}
                            </span>
                            <span className="text-[10px] text-[var(--muted-foreground)]">{stat.unit}</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="card mb-8">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Core Web Vitals
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map((stat) => (
                    <div key={stat.label} className="p-4 rounded-lg bg-[var(--background)] border border-[var(--border)] group hover:border-[var(--foreground)] transition-colors">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-[var(--muted-foreground)]">{stat.label}</span>
                            <stat.icon className={`w-4 h-4 ${getStatusColor(stat.status as MetricStatus)}`} />
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className={`text-2xl font-bold ${getStatusColor(stat.status as MetricStatus)}`}>
                                {stat.value}
                            </span>
                            <span className="text-xs text-[var(--muted-foreground)]">{stat.unit}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-medium ${getStatusBg(stat.status as MetricStatus)} ${getStatusColor(stat.status as MetricStatus)}`}>
                                {stat.status}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
