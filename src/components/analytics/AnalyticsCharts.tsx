'use client';

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import type { AnalyticsStats } from '@/lib/analytics';

interface AnalyticsChartsProps {
    data: AnalyticsStats;
    period: string;
}

export function AnalyticsCharts({ data, period }: AnalyticsChartsProps) {
    const { aggregate, timeseries, sources, locations } = data;

    // Format duration
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s`;
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 shadow-xl ring-1 ring-black/5">
                    <p className="text-sm font-medium text-[var(--foreground)] mb-2">
                        {new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <div className="space-y-1">
                        {payload.map((entry: any, index: number) => (
                            <div key={index} className="flex items-center gap-2 text-xs">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="text-[var(--muted-foreground)]">{entry.name}:</span>
                                <span className="font-mono font-medium text-[var(--foreground)]">{entry.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard
                    title="Unique Visitors"
                    value={aggregate.visitors.value.toLocaleString()}
                />
                <SummaryCard
                    title="Total Pageviews"
                    value={aggregate.pageviews.value.toLocaleString()}
                />
                <SummaryCard
                    title="Bounce Rate"
                    value={`${aggregate.bounce_rate.value}%`}
                />
                <SummaryCard
                    title="Visit Duration"
                    value={formatDuration(aggregate.visit_duration.value)}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Chart */}
                <div className="lg:col-span-2 p-6 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
                    <h3 className="text-lg font-semibold mb-6">Traffic Over Time</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timeseries}>
                                <defs>
                                    <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorPageviews" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--info)" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="var(--info)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.4} />
                                <XAxis
                                    dataKey="date"
                                    stroke="var(--muted-foreground)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => {
                                        const date = new Date(value);
                                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                    }}
                                    dy={10}
                                />
                                <YAxis
                                    stroke="var(--muted-foreground)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}`}
                                    dx={-10}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                <Area
                                    type="monotone"
                                    dataKey="visitors"
                                    stroke="var(--primary)"
                                    fillOpacity={1}
                                    fill="url(#colorVisitors)"
                                    strokeWidth={2}
                                    name="Visitors"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="pageviews"
                                    stroke="var(--info)"
                                    fillOpacity={1}
                                    fill="url(#colorPageviews)"
                                    strokeWidth={2}
                                    name="Pageviews"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Top Sources */}
                    <div className="p-6 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm h-fit">
                        <h3 className="text-lg font-semibold mb-4">Top Sources</h3>
                        <div className="space-y-4">
                            {sources.map((source, index) => (
                                <div key={index} className="flex items-center justify-between group">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-[var(--primary)] group-hover:scale-125 transition-transform duration-200" />
                                        <span className="text-sm font-medium">{source.source}</span>
                                    </div>
                                    <span className="text-sm text-[var(--muted-foreground)] font-mono">
                                        {source.visitors.toLocaleString()}
                                    </span>
                                </div>
                            ))}
                            {sources.length === 0 && (
                                <p className="text-sm text-[var(--muted-foreground)]">No data available</p>
                            )}
                        </div>
                    </div>

                    {/* Top Locations */}
                    <div className="p-6 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm h-fit">
                        <h3 className="text-lg font-semibold mb-4">Top Locations</h3>
                        <div className="space-y-4">
                            {locations.map((location, index) => (
                                <div key={index} className="flex items-center justify-between group">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-[var(--info)] group-hover:scale-125 transition-transform duration-200" />
                                        <span className="text-sm font-medium">{location.country}</span>
                                    </div>
                                    <span className="text-sm text-[var(--muted-foreground)] font-mono">
                                        {location.visitors.toLocaleString()}
                                    </span>
                                </div>
                            ))}
                            {locations.length === 0 && (
                                <p className="text-sm text-[var(--muted-foreground)]">No data available</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
    return (
        <div className="p-6 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm hover:border-[var(--primary)] transition-colors duration-200">
            <h3 className="text-sm font-medium text-[var(--muted-foreground)]">{title}</h3>
            <div className="mt-2 text-2xl font-bold font-mono tracking-tight">{value}</div>
        </div>
    );
}
