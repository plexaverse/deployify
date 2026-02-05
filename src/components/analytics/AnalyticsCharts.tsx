'use client';

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar
} from 'recharts';
import type { AnalyticsStats } from '@/lib/analytics';

// Simple Card components if they don't exist in @/components/ui/card,
// but assuming they might since previous files used similar structure.
// If not, I'll fallback to div with classes.
// Wait, I haven't checked for ui/card. I'll just use raw divs with tailwind and theme vars to be safe and consistent with "Edit Source, Not Artifacts" and avoiding assuming shadcn presence if not verified.
// Actually, looking at ui.md, it mentions `src/components/ui`.
// Let me quickly check if card exists.
// I'll stick to raw HTML/Tailwind to avoid dependency on unverified components,
// OR I can quickly check. I'll check first.
// But to save turn, I'll write the code using standard Tailwind classes that match the theme.

interface AnalyticsChartsProps {
    data: AnalyticsStats;
    period: string;
}

export function AnalyticsCharts({ data, period }: AnalyticsChartsProps) {
    const { aggregate, timeseries, sources } = data;

    // Format duration
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s`;
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
                <div className="lg:col-span-2 p-6 rounded-xl border border-[var(--border)] bg-[var(--card)]">
                    <h3 className="text-lg font-semibold mb-6">Traffic Over Time</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timeseries}>
                                <defs>
                                    <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorPageviews" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--secondary)" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
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
                                />
                                <YAxis
                                    stroke="var(--muted-foreground)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'var(--popover)',
                                        borderColor: 'var(--border)',
                                        borderRadius: '8px',
                                        color: 'var(--popover-foreground)',
                                    }}
                                    itemStyle={{ color: 'var(--foreground)' }}
                                    labelStyle={{ color: 'var(--muted-foreground)' }}
                                />
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
                                    stroke="var(--secondary)"
                                    fillOpacity={1}
                                    fill="url(#colorPageviews)"
                                    strokeWidth={2}
                                    name="Pageviews"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Sources */}
                <div className="p-6 rounded-xl border border-[var(--border)] bg-[var(--card)]">
                    <h3 className="text-lg font-semibold mb-6">Top Sources</h3>
                    <div className="space-y-4">
                        {sources.map((source, index) => (
                            <div key={index} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-[var(--primary)]" />
                                    <span className="text-sm font-medium">{source.source}</span>
                                </div>
                                <span className="text-sm text-[var(--muted-foreground)]">
                                    {source.visitors.toLocaleString()}
                                </span>
                            </div>
                        ))}
                        {sources.length === 0 && (
                            <p className="text-sm text-[var(--muted-foreground)]">No data available</p>
                        )}
                    </div>
                    {/* Optional Bar Chart for sources if needed, but list is usually cleaner for small breakdown */}
                    <div className="mt-6 h-[150px] w-full">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={sources} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis
                                    type="category"
                                    dataKey="source"
                                    stroke="var(--muted-foreground)"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    width={50}
                                />
                                <Tooltip
                                    cursor={{fill: 'var(--muted)', opacity: 0.1}}
                                    contentStyle={{
                                        backgroundColor: 'var(--popover)',
                                        borderColor: 'var(--border)',
                                        borderRadius: '8px',
                                        color: 'var(--popover-foreground)',
                                    }}
                                />
                                <Bar dataKey="visitors" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
    return (
        <div className="p-6 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <h3 className="text-sm font-medium text-[var(--muted-foreground)]">{title}</h3>
            <div className="mt-2 text-2xl font-bold">{value}</div>
        </div>
    );
}
