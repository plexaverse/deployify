'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Database, Search, AlertCircle, Loader2, BarChart2, RefreshCw, Clock, Globe } from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

interface WidgetData {
    name?: string;
    refreshInterval?: number;
    chartConfig?: {
        type: 'bar' | 'line' | 'area' | 'pie';
        xAxis: string;
        yAxis: string;
    };
    storageId: string;
    query: string;
}

export default function SharedDashboardPage() {
    const { id: widgetId } = useParams();
    const searchParams = useSearchParams();
    const projectId = searchParams.get('p');

    const [widget, setWidget] = useState<WidgetData | null>(null);
    const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExecuting, setIsExecuting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchWidget = useCallback(async () => {
        if (!projectId || !widgetId) {
            setError('Missing project or widget identification');
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch(`/api/projects/${projectId}/storage/dashboards/${widgetId}`);
            const data = await response.json();
            if (data.success) {
                setWidget(data.widget);
            } else {
                setError(data.error || 'Failed to load widget details');
            }
        } catch {
            setError('Network error: Failed to fetch widget metadata');
        } finally {
            setIsLoading(false);
        }
    }, [projectId, widgetId]);

    const executeQuery = useCallback(async () => {
        if (!widget || !projectId || !widgetId) return;

        setIsExecuting(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${widget.storageId}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ widgetId }),
            });
            const data = await response.json();
            if (data.success) {
                setResults(data.results);
                setLastUpdated(new Date());
            } else {
                setError(data.error);
            }
        } catch {
            setError('Failed to fetch data from storage proxy');
        } finally {
            setIsExecuting(false);
        }
    }, [projectId, widget, widgetId]);

    useEffect(() => {
        fetchWidget();
    }, [fetchWidget]);

    useEffect(() => {
        if (widget) {
            executeQuery();
            if (widget.refreshInterval && widget.refreshInterval > 0) {
                const interval = setInterval(executeQuery, widget.refreshInterval * 1000);
                return () => clearInterval(interval);
            }
        }
    }, [widget, executeQuery]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-6 space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-[var(--primary)]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Fetching shared insight...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-[var(--error)]/10 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-[var(--error)]" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl font-semibold uppercase">Access Denied</h2>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] max-w-md mx-auto">
                        {error}. This insight may be private, deleted, or you may have followed an invalid link.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--background)] p-6 md:p-12">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center border border-[var(--primary)]/20 shadow-lg shadow-[var(--primary)]/5">
                            <BarChart2 className="w-6 h-6 text-[var(--primary)]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Shared Insight</span>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--success)]/10 border border-[var(--success)]/20">
                                    <Globe className="w-2.5 h-2.5 text-[var(--success)]" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--success)]">Public</span>
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight uppercase">{widget?.name}</h1>
                        </div>
                    </div>
                    <div className="text-right">
                        {lastUpdated && (
                            <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                                <Clock className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    Updated: {lastUpdated.toLocaleTimeString()}
                                </span>
                            </div>
                        )}
                        {widget?.refreshInterval && widget.refreshInterval > 0 && (
                            <div className="flex items-center gap-2 text-[var(--primary)] mt-1">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    Auto-refresh: {widget.refreshInterval}s
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <Card className="overflow-hidden border-[var(--primary)]/20 shadow-2xl shadow-[var(--primary)]/5 bg-[var(--background)] flex flex-col min-h-[500px]">
                    <div className="flex-1 p-8 flex flex-col">
                        {isExecuting && !results && (
                            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Running secure query...</span>
                            </div>
                        )}

                        {results && (
                            <div className="flex-1">
                                {widget?.chartConfig ? (
                                    <SharedChart results={results} config={widget.chartConfig} />
                                ) : (
                                    <SharedTable results={results} />
                                )}
                            </div>
                        )}

                        {!isExecuting && (!results || results.length === 0) && (
                            <div className="flex-1 flex flex-col items-center justify-center space-y-4 text-[var(--muted-foreground)]">
                                <Search className="w-12 h-12 opacity-20" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">No results found</span>
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-[var(--muted)]/5 border-t border-[var(--border)] flex items-center justify-between">
                        <div className="flex items-center gap-4 text-[var(--muted-foreground)]">
                            <div className="flex items-center gap-1.5">
                                <Database className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Secure Managed Storage</span>
                            </div>
                            <Separator orientation="vertical" className="h-4 bg-[var(--border)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{results?.length || 0} Rows Returned</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">
                            DEPLOYIFY DATA LAB &copy; {new Date().getFullYear()}
                        </span>
                    </div>
                </Card>

                <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/40 max-w-xl mx-auto">
                        This data insight is hosted on Deployify. Access to the underlying infrastructure is strictly proxied and read-only.
                    </p>
                </div>
            </div>
        </div>
    );
}

function SharedChart({ results, config }: { results: Record<string, unknown>[], config: NonNullable<WidgetData['chartConfig']> }) {
    const type = config.type;
    const ChartComponent = type === 'bar' ? BarChart : type === 'line' ? LineChart : AreaChart;
    const DataComponent = (type === 'bar' ? Bar : type === 'line' ? Line : Area) as unknown as React.ElementType;

    return (
        <div className="h-[450px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                {type === 'pie' ? (
                    <PieChart>
                        <Pie
                            data={results}
                            cx="50%"
                            cy="50%"
                            outerRadius={160}
                            fill="var(--primary)"
                            dataKey={config.yAxis}
                            nameKey={config.xAxis}
                            label={({ name, percent }) => `${String(name).toUpperCase()} ${((percent || 0) * 100).toFixed(0)}%`}
                        >
                            {results.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--popover)',
                                borderColor: 'var(--border)',
                                borderRadius: '8px',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                            }}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px' }} />
                    </PieChart>
                ) : (
                    <ChartComponent data={results}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} vertical={false} />
                        <XAxis
                            dataKey={config.xAxis}
                            stroke="var(--muted-foreground)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(val: unknown) => String(val).toUpperCase()}
                        />
                        <YAxis
                            stroke="var(--muted-foreground)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--popover)',
                                borderColor: 'var(--border)',
                                borderRadius: '8px',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                            }}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px' }} />
                        <DataComponent
                            type="monotone"
                            dataKey={config.yAxis}
                            fill="var(--primary)"
                            stroke="var(--primary)"
                            fillOpacity={0.3}
                            strokeWidth={2}
                            radius={[4, 4, 0, 0]}
                        />
                    </ChartComponent>
                )}
            </ResponsiveContainer>
        </div>
    );
}

function SharedTable({ results }: { results: Record<string, unknown>[] }) {
    const columns = Object.keys(results[0]).slice(0, 10);
    return (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-[var(--muted)]/20 border-b border-[var(--border)]">
                        {columns.map(col => (
                            <th key={col} className="p-4 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                {col}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {results.map((row, i) => (
                        <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/5 transition-colors">
                            {columns.map(col => (
                                <td key={col} className="p-4 text-[10px] font-mono whitespace-nowrap max-w-[300px] truncate">
                                    {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
