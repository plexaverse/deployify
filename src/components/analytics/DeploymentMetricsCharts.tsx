'use client';

import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import type { Deployment, TooltipEntry } from '@/types';
import { formatDuration } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Clock, Zap } from 'lucide-react';

interface DeploymentMetricsChartsProps {
    deployments: Deployment[];
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) => {
    if (active && payload && payload.length && label) {
        return (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 shadow-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                    {new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                </p>
                 {payload.map((entry: TooltipEntry, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-[var(--muted-foreground)]">{entry.name}:</span>
                        <span className="font-mono font-semibold text-[var(--foreground)]">
                            {entry.name === 'Duration' ? formatDuration(Number(entry.value) * 1000) : entry.value}
                        </span>
                    </div>
                ))}
                {payload[0] && !!payload[0].payload.commit && (
                     <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] border-t border-[var(--border)] pt-2 max-w-[200px] truncate">
                         Commit: {payload[0].payload.commit as string}
                     </div>
                )}
            </div>
        );
    }
    return null;
};

export function DeploymentMetricsCharts({ deployments }: DeploymentMetricsChartsProps) {
    // Process data for charts
    // We want to show chronological order
    const data = [...deployments]
        .filter(d => d.status === 'ready' && d.buildDurationMs)
        .reverse() // deployments come in desc order (newest first), reverse for chronological (oldest first)
        .map(d => ({
            id: d.id.substring(0, 8), // Short ID for label
            date: new Date(d.createdAt).toLocaleDateString('en-US'), // Use fixed locale for hydration stability
            duration: d.buildDurationMs ? Math.round(d.buildDurationMs / 1000) : 0, // in seconds
            score: d.performanceMetrics?.performanceScore ? Math.round(d.performanceMetrics.performanceScore * 100) : null,
            commit: d.gitCommitMessage
        }));

    if (data.length === 0) {
        return (
            <Card className="overflow-hidden p-0 border-dashed bg-[var(--muted)]/5">
                <div className="p-8 text-center flex flex-col items-center">
                     <div className="w-12 h-12 rounded-2xl bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-6 shadow-sm">
                        <Zap className="w-6 h-6 text-[var(--muted-foreground)] opacity-50" />
                     </div>
                     <h3 className="text-xl font-semibold mb-2 tracking-tight">No Deployment Metrics</h3>
                     <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] max-w-xs mx-auto leading-relaxed">
                         Successful production deployments are required to generate performance and build history.
                     </p>
                </div>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Build Duration Chart */}
            <Card className="overflow-hidden p-0">
                <div className="p-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Clock className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Build Efficiency</span>
                        <h3 className="text-xl font-semibold">Build Duration History</h3>
                    </div>
                </div>
                <Separator className="bg-[var(--border)]" />
                <div className="p-6">
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.4} />
                                <XAxis
                                    dataKey="date"
                                    stroke="var(--muted-foreground)"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    dy={10}
                                    tickFormatter={(value) => {
                                        const date = new Date(value);
                                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
                                    }}
                                />
                                <YAxis
                                    stroke="var(--muted-foreground)"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(val) => `${val}s`}
                                    dx={-10}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.1 }} />
                                <Bar
                                    dataKey="duration"
                                    name="Duration"
                                    fill="var(--primary)"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </Card>

            {/* Performance Score Chart */}
            <Card className="overflow-hidden p-0">
                <div className="p-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--success)]/10 flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-[var(--success)]" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Optimization Score</span>
                        <h3 className="text-xl font-semibold">Performance Score History</h3>
                    </div>
                </div>
                <Separator className="bg-[var(--border)]" />
                <div className="p-6">
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.4} />
                                <XAxis
                                    dataKey="date"
                                    stroke="var(--muted-foreground)"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    dy={10}
                                    tickFormatter={(value) => {
                                        const date = new Date(value);
                                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
                                    }}
                                />
                                <YAxis
                                    stroke="var(--muted-foreground)"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[0, 100]}
                                    dx={-10}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                <Line
                                    type="monotone"
                                    dataKey="score"
                                    name="Score"
                                    stroke="var(--success)"
                                    strokeWidth={2}
                                    dot={{ fill: 'var(--success)', r: 4 }}
                                    activeDot={{ r: 6 }}
                                    connectNulls
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </Card>
        </div>
    );
}
