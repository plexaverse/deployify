'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface HealthPoint {
    status: 'healthy' | 'unhealthy' | 'unknown' | 'degraded';
    latency: number;
    timestamp: string;
}

interface ConnectivityHealthChartProps {
    data: HealthPoint[];
    height?: number;
    className?: string;
    showStats?: boolean;
}

export function ConnectivityHealthChart({
    data,
    height = 40,
    className,
    showStats = false
}: ConnectivityHealthChartProps) {
    const points = useMemo(() => {
        if (!data || data.length < 2) return [];

        const maxLatency = Math.max(...data.map(d => d.latency), 50);
        const width = 100; // Normalized width
        const step = width / (data.length - 1);

        return data.map((d, i) => ({
            x: i * step,
            y: height - (d.latency / maxLatency) * height,
            status: d.status,
            latency: d.latency
        }));
    }, [data, height]);

    const latestLatency = data?.[data.length - 1]?.latency || 0;
    const avgLatency = data?.length > 0
        ? Math.round(data.reduce((acc, d) => acc + d.latency, 0) / data.length)
        : 0;

    if (!data || data.length < 2) {
        return (
            <div className={cn("flex flex-col items-center justify-center bg-[var(--muted)]/5 border border-dashed border-[var(--border)] rounded-lg", className)} style={{ height }}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] opacity-50">Insufficient Data</span>
            </div>
        );
    }

    // Create SVG path string
    const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Determine color based on latest status
    const latestStatus = data[data.length - 1].status;
    const strokeColor = latestStatus === 'healthy' ? 'var(--success)' :
                      latestStatus === 'degraded' ? 'var(--warning)' :
                      latestStatus === 'unhealthy' ? 'var(--error)' : 'var(--primary)';

    return (
        <div className={cn("space-y-2", className)}>
            <div className="relative group">
                <svg
                    viewBox={`0 0 100 ${height}`}
                    className="w-full overflow-visible"
                    preserveAspectRatio="none"
                    style={{ height }}
                >
                    <defs>
                        <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
                            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {/* Area fill */}
                    <path
                        d={`${pathData} L 100 ${height} L 0 ${height} Z`}
                        fill="url(#chartGradient)"
                        className="transition-all duration-500 ease-in-out"
                    />

                    {/* Line */}
                    <path
                        d={pathData}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-all duration-500 ease-in-out"
                    />

                    {/* Latest point indicator */}
                    {points.length > 0 && (
                        <circle
                            cx={points[points.length - 1].x}
                            cy={points[points.length - 1].y}
                            r="3"
                            fill={strokeColor}
                            className="animate-pulse"
                        />
                    )}
                </svg>

                {/* Hover indicator (simplified) */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                    <div className="absolute right-0 top-0 bg-[var(--background)] border border-[var(--border)] rounded px-1.5 py-0.5 shadow-sm">
                        <p className="text-[10px] font-mono font-bold whitespace-nowrap">
                            LATEST: {latestLatency}ms
                        </p>
                    </div>
                </div>
            </div>

            {showStats && (
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Average</span>
                            <span className="text-[10px] font-mono font-bold">{avgLatency}ms</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Samples</span>
                            <span className="text-[10px] font-mono font-bold">{data.length}</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Trend</span>
                        <span className={cn(
                            "text-[10px] font-bold uppercase",
                            latestLatency <= avgLatency ? "text-[var(--success)]" : "text-[var(--warning)]"
                        )}>
                            {latestLatency <= avgLatency ? 'STABLE' : 'SPIKING'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
