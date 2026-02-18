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
import type { Deployment } from '@/types';
import { formatDuration } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface DeploymentMetricsChartsProps {
    deployments: Deployment[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 shadow-xl">
                <p className="text-sm font-medium text-[var(--foreground)] mb-2">
                    {label}
                </p>
                 {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-[var(--muted-foreground)]">{entry.name}:</span>
                        <span className="font-mono font-medium text-[var(--foreground)]">
                            {entry.name === 'Duration' ? formatDuration(entry.value * 1000) : entry.value}
                        </span>
                    </div>
                ))}
                {payload[0] && payload[0].payload.commit && (
                     <div className="mt-2 text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-2 max-w-[200px] truncate">
                         Commit: {payload[0].payload.commit}
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
            <Card className="p-12 text-center">
                 <h3 className="text-lg font-semibold mb-2">No Deployment Metrics</h3>
                 <p className="text-[var(--muted-foreground)]">
                     Once you have successful deployments, metrics will appear here.
                 </p>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Build Duration Chart */}
            <Card className="p-6">
                <h3 className="text-lg font-semibold mb-6">Build Duration History</h3>
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
                                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
            </Card>

            {/* Performance Score Chart */}
            <Card className="p-6">
                <h3 className="text-lg font-semibold mb-6">Performance Score History</h3>
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
                                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
            </Card>
        </div>
    );
}
