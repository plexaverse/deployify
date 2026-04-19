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
import { AnalyticsStats, TooltipEntry } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { BarChart3, Globe, Share2 } from 'lucide-react';

interface AnalyticsChartsProps {
    data: AnalyticsStats;
    period: string;
}

export function AnalyticsCharts({ data }: AnalyticsChartsProps) {
    const { aggregate, timeseries, sources, locations, performance } = data;

    // Helper for Web Vitals status
    const getVitalStatus = (metric: string, value: number) => {
        if (metric === 'lcp') return value < 2500 ? 'good' : value < 4000 ? 'needs-improvement' : 'poor';
        if (metric === 'fid') return value < 100 ? 'good' : value < 300 ? 'needs-improvement' : 'poor';
        if (metric === 'cls') return value < 0.1 ? 'good' : value < 0.25 ? 'needs-improvement' : 'poor';
        if (metric === 'fcp') return value < 1800 ? 'good' : value < 3000 ? 'needs-improvement' : 'poor';
        if (metric === 'ttfb') return value < 800 ? 'good' : value < 1800 ? 'needs-improvement' : 'poor';
        return 'good';
    };

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
                    value={`${aggregate.bounce_rate.value.toFixed(1)}%`}
                />
                <SummaryCard
                    title="Visit Duration"
                    value={formatDuration(aggregate.visit_duration.value)}
                />
            </div>

            {/* Performance Metrics (Web Vitals) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <WebVitalCard
                    title="LCP"
                    value={performance?.lcp || 0}
                    unit="ms"
                    status={getVitalStatus('lcp', performance?.lcp || 0)}
                    description="Largest Contentful Paint: Measures loading performance."
                />
                <WebVitalCard
                    title="FID"
                    value={performance?.fid || 0}
                    unit="ms"
                    status={getVitalStatus('fid', performance?.fid || 0)}
                    description="First Input Delay: Measures interactivity."
                />
                <WebVitalCard
                    title="CLS"
                    value={performance?.cls || 0}
                    unit=""
                    status={getVitalStatus('cls', performance?.cls || 0)}
                    description="Cumulative Layout Shift: Measures visual stability."
                />
                <WebVitalCard
                    title="FCP"
                    value={performance?.fcp || 0}
                    unit="ms"
                    status={getVitalStatus('fcp', performance?.fcp || 0)}
                    description="First Contentful Paint: Time until first pixels render."
                />
                <WebVitalCard
                    title="TTFB"
                    value={performance?.ttfb || 0}
                    unit="ms"
                    status={getVitalStatus('ttfb', performance?.ttfb || 0)}
                    description="Time to First Byte: Server response time."
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Chart */}
                <Card className="lg:col-span-2 overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <BarChart3 className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Traffic Trends</span>
                            <h3 className="text-[9px] font-bold">Traffic Over Time</h3>
                        </div>
                    </div>
                    <Separator className="bg-[var(--border)]" />
                    <div className="p-6">
                        <div className="h-[300px] min-h-[300px] w-full">
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
                                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
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
                                    <Tooltip content={<AnalyticsTooltip />} cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '4 4' }} />
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
                </Card>

                <div className="space-y-6">
                    {/* Top Sources */}
                    <Card className="overflow-hidden p-0 h-fit">
                        <div className="p-6 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                <Share2 className="w-5 h-5 text-[var(--primary)]" />
                            </div>
                            <div>
                                <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Referral Traffic</span>
                                <h3 className="text-[9px] font-bold">Top Sources</h3>
                            </div>
                        </div>
                        <Separator className="bg-[var(--border)]" />
                        <div className="p-6">
                            <div className="space-y-4">
                                {sources.map((source: { source: string; visitors: number }, index: number) => (
                                    <div key={index} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-[var(--primary)] group-hover:scale-125 transition-transform duration-200" />
                                            <span className="text-[7px] font-bold uppercase tracking-wider">{source.source}</span>
                                        </div>
                                        <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] font-mono">
                                            {source.visitors.toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                                {sources.length === 0 && (
                                    <p className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">No data available</p>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* Top Locations */}
                    <Card className="overflow-hidden p-0 h-fit">
                        <div className="p-6 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--info)]/10 flex items-center justify-center shrink-0">
                                <Globe className="w-5 h-5 text-[var(--info)]" />
                            </div>
                            <div>
                                <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Geographic Reach</span>
                                <h3 className="text-[9px] font-bold">Top Locations</h3>
                            </div>
                        </div>
                        <Separator className="bg-[var(--border)]" />
                        <div className="p-6">
                            <div className="space-y-4">
                                {locations.map((location: { country: string; visitors: number }, index: number) => (
                                    <div key={index} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-[var(--info)] group-hover:scale-125 transition-transform duration-200" />
                                            <span className="text-[7px] font-bold uppercase tracking-wider">{location.country}</span>
                                        </div>
                                        <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] font-mono">
                                            {location.visitors.toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                                {locations.length === 0 && (
                                    <p className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">No data available</p>
                                )}
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function WebVitalCard({ title, value, unit, status, description }: {
    title: string;
    value: number;
    unit: string;
    status: 'good' | 'needs-improvement' | 'poor';
    description: string;
}) {
    const variant = status === 'good' ? 'success' : status === 'needs-improvement' ? 'warning' : 'error';

    return (
        <Card className="overflow-hidden p-0 hover:border-[var(--primary)] hover:shadow-md transition-all duration-200 group">
            <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[7px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">{title}</span>
                    <div className={cn("w-2 h-2 rounded-full animate-pulse",
                        status === 'good' ? 'bg-[var(--success)]' :
                        status === 'needs-improvement' ? 'bg-[var(--warning)]' :
                        'bg-[var(--error)]')} />
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-[9px] font-bold font-mono tracking-tight group-hover:text-[var(--primary)] transition-colors">
                        {value < 1 ? value.toFixed(3) : Math.round(value)}
                    </span>
                    <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">{unit}</span>
                </div>
                <div className="mt-2">
                    <Badge variant={variant} className="text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5">
                        {status.replace('-', ' ')}
                    </Badge>
                </div>
                <p className="mt-3 text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-snug line-clamp-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    {description}
                </p>
            </div>
        </Card>
    );
}

function AnalyticsTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
    if (active && payload && payload.length && label) {
        return (
            <Card className="overflow-hidden p-0 shadow-2xl bg-[var(--card)] border-[var(--border)]">
                <div className="p-3">
                    <p className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                        {new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                    </p>
                    <div className="space-y-1">
                        {payload.map((entry: TooltipEntry, index: number) => (
                            <div key={index} className="flex items-center gap-2 text-[7px] font-bold uppercase tracking-wider">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="text-[var(--muted-foreground)]">{entry.name}:</span>
                                <span className="text-[var(--foreground)]">{(entry.value as number).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>
        );
    }
    return null;
}

function SummaryCard({ title, value }: { title: string; value: string }) {
    return (
        <Card className="overflow-hidden p-0 hover:border-[var(--primary)] hover:shadow-md transition-all duration-300 group">
            <div className="p-6">
                <h3 className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] group-hover:text-[var(--primary)] transition-colors">
                    {title}
                </h3>
                <div className="mt-3 text-[9px] font-bold font-mono tracking-tighter text-[var(--foreground)]">
                    {value}
                </div>
            </div>
        </Card>
    );
}
