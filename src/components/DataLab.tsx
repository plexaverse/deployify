'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database, Play, Terminal, AlertCircle, Loader2, CheckCircle2, Table, Info, Search, Download, BarChart2, TrendingUp, History, Save, Trash2, Clock, ChevronRight, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { StorageConfig } from '@/types';

interface DataLabProps {
    projectId: string;
    connectors: StorageConfig[];
}

export function DataLab({ projectId, connectors }: DataLabProps) {
    const [selectedId, setSelectedId] = useState(connectors[0]?.id || '');
    const [query, setQuery] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
    const [schema, setSchema] = useState<{ tables?: string[], collections?: string[], columns?: Record<string, { name: string, type: string }[]> } | null>(null);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [performanceData, setPerformanceData] = useState<{ avgLatency: number, successRate: number, totalQueries?: number, timeseries?: { date: string, avgLatency: number }[] } | null>(null);
    const [showInsights, setShowInsights] = useState(false);
    const [history, setHistory] = useState<{ id: string, query: string, timestamp: string, error?: string }[]>([]);
    const [savedQueries, setSavedQueries] = useState<{ id: string, name: string, query: string }[]>([]);
    const [isSavingQuery, setIsSavingQuery] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [newQueryName, setNewQueryName] = useState('');
    const [activeTab, setActiveTab] = useState<'editor' | 'history' | 'saved'>('editor');

    const fetchHistory = useCallback(async () => {
        if (!selectedId) return;
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/history`);
            const data = await response.json();
            if (data.success) {
                setHistory(data.history);
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
        }
    }, [projectId, selectedId]);

    const fetchSavedQueries = useCallback(async () => {
        if (!selectedId) return;
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/queries`);
            const data = await response.json();
            if (data.success) {
                setSavedQueries(data.queries);
            }
        } catch (error) {
            console.error('Failed to fetch saved queries:', error);
        }
    }, [projectId, selectedId]);

    const fetchMetrics = useCallback(async () => {
        if (!selectedId) return;
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/metrics`);
            const data = await response.json();
            if (data.success) {
                setPerformanceData(data.stats);
            }
        } catch (error) {
            console.error('Failed to fetch storage metrics:', error);
        }
    }, [projectId, selectedId]);

    useEffect(() => {
        fetchMetrics();
        fetchHistory();
        fetchSavedQueries();
    }, [fetchMetrics, fetchHistory, fetchSavedQueries]);

    const executeQuery = async (overrideQuery?: string) => {
        const queryToRun = overrideQuery || query;
        if (!selectedId || !queryToRun.trim()) return;

        setIsExecuting(true);
        if (!overrideQuery) setError(null);
        if (!overrideQuery) setResults(null);

        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: queryToRun }),
            });

            const data = await response.json();
            if (data.success) {
                if (queryToRun === 'DISCOVER_SCHEMA') {
                    setSchema(data.results[0]);
                } else {
                    setResults(data.results);
                    // Re-fetch historical metrics and history after execution
                    fetchMetrics();
                    fetchHistory();
                }
            } else {
                setError(data.error || 'Failed to execute query');
            }
        } catch {
            setError('Network error: Failed to connect to proxy');
        } finally {
            setIsExecuting(false);
        }
    };

    const discoverSchema = async () => {
        setIsDiscovering(true);
        await executeQuery('DISCOVER_SCHEMA');
        setIsDiscovering(false);
    };

    const saveQuery = async () => {
        if (!newQueryName.trim() || !query.trim()) return;
        setIsSavingQuery(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/queries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newQueryName, query }),
            });
            const data = await response.json();
            if (data.success) {
                setShowSaveModal(false);
                setNewQueryName('');
                fetchSavedQueries();
            }
        } catch (error) {
            console.error('Failed to save query:', error);
        } finally {
            setIsSavingQuery(false);
        }
    };

    const deleteSavedQuery = async (queryId: string) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/queries/${queryId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                fetchSavedQueries();
            }
        } catch (error) {
            console.error('Failed to delete saved query:', error);
        }
    };

    const downloadCSV = () => {
        if (!results || results.length === 0) return;

        const columns = Object.keys(results[0]);
        const header = columns.join(',');
        const rows = results.map(row =>
            columns.map(col => {
                const val = row[col];
                const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                return `"${stringVal.replace(/"/g, '""')}"`;
            }).join(',')
        );

        const csvContent = [header, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `datalab-export-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const selectedConnector = connectors.find(c => c.id === selectedId);

    const renderResultsTable = () => {
        if (!results || results.length === 0) return null;
        const columns = Object.keys(results[0]);

        return (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--background)]">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[var(--muted)]/20 border-b border-[var(--border)]">
                            {columns.map(col => (
                                <th key={col} className="p-3 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] whitespace-nowrap">
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((row, i) => (
                            <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/5 transition-colors">
                                {columns.map(col => (
                                    <td key={col} className="p-3 text-[10px] font-mono whitespace-nowrap max-w-[200px] truncate">
                                        {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <Card className="overflow-hidden p-0 border-[var(--primary)]/20 shadow-xl shadow-[var(--primary)]/5">
            <div className="p-6 flex items-center justify-between bg-[var(--primary)]/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center shrink-0">
                        <Terminal className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Data Lab (Experimental)</span>
                        <h3 className="text-xl font-semibold">Managed Query Browser</h3>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    {performanceData && (
                        <>
                            <div className="text-right hidden md:block">
                                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Avg Latency</span>
                                <span className="text-sm font-semibold text-[var(--primary)]">{performanceData.avgLatency}ms</span>
                            </div>
                            <div className="text-right hidden md:block">
                                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Success Rate</span>
                                <span className="text-sm font-semibold text-[var(--success)]">{performanceData.successRate}%</span>
                            </div>
                        </>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowInsights(!showInsights)}
                        className={`h-8 px-3 text-[10px] font-bold uppercase tracking-wider ${showInsights ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}
                    >
                        <BarChart2 className="w-4 h-4 mr-2" />
                        Performance Insights
                    </Button>
                </div>
            </div>

            <Separator className="bg-[var(--border)]" />

            <div className="px-6 py-2 bg-[var(--muted)]/5 border-b border-[var(--border)] flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('editor')}
                    className={`h-8 px-3 text-[10px] font-bold uppercase tracking-wider rounded-none border-b-2 transition-all ${activeTab === 'editor' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-[var(--muted-foreground)]'}`}
                >
                    <Terminal className="w-3.5 h-3.5 mr-2" />
                    Query Editor
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('saved')}
                    className={`h-8 px-3 text-[10px] font-bold uppercase tracking-wider rounded-none border-b-2 transition-all ${activeTab === 'saved' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-[var(--muted-foreground)]'}`}
                >
                    <Save className="w-3.5 h-3.5 mr-2" />
                    Saved Queries
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('history')}
                    className={`h-8 px-3 text-[10px] font-bold uppercase tracking-wider rounded-none border-b-2 transition-all ${activeTab === 'history' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-[var(--muted-foreground)]'}`}
                >
                    <History className="w-3.5 h-3.5 mr-2" />
                    Query History
                </Button>
            </div>

            <div className="p-6 space-y-6">
                {activeTab === 'editor' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Select Connector</Label>
                        <select
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                            className="w-full h-10 px-3 rounded-lg bg-[var(--muted)]/20 border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50"
                        >
                            {connectors.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.type.toUpperCase()})</option>
                            ))}
                        </select>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                {selectedConnector?.type.includes('sql') ? 'SQL Query (Read-Only)' : 'NoSQL Filter / JSON'}
                            </Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]"
                                onClick={discoverSchema}
                                disabled={isDiscovering}
                            >
                                {isDiscovering ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Search className="w-3 h-3 mr-1.5" />}
                                Discover Schema
                            </Button>
                        </div>
                        <div className="relative">
                            <textarea
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={
                                    selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale'
                                        ? "SELECT * FROM users LIMIT 10"
                                        : selectedConnector?.type === 'memorystore-redis'
                                            ? "GET user:1  OR  { \"command\": \"hgetall\", \"args\": [\"user:1\"] }"
                                            : "{ \"collection\": \"users\", \"limit\": 10 }"
                                }
                                className="w-full h-32 p-4 rounded-xl bg-[var(--background)] border border-[var(--border)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 resize-none"
                            />
                            <div className="absolute bottom-4 right-4 flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowSaveModal(true)}
                                    disabled={!query.trim()}
                                    className="h-10 px-4 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    Save
                                </Button>
                                <MovingBorderButton
                                    onClick={() => executeQuery()}
                                    disabled={isExecuting || !query.trim()}
                                    containerClassName="h-10 w-32"
                                    className="text-[10px] font-bold uppercase tracking-wider"
                                >
                                    {isExecuting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                                    Run Query
                                </MovingBorderButton>
                            </div>
                        </div>
                    </div>
                </div>
                ) : activeTab === 'saved' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
                        {savedQueries.length === 0 ? (
                            <div className="col-span-full py-12 text-center space-y-4 border border-dashed border-[var(--border)] rounded-2xl bg-[var(--muted)]/5">
                                <Save className="w-8 h-8 text-[var(--muted-foreground)]/30 mx-auto" />
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">No saved queries yet</p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">Save frequently used queries for quick access</p>
                                </div>
                            </div>
                        ) : (
                            savedQueries.map(q => (
                                <Card key={q.id} className="p-4 bg-[var(--background)] border-[var(--border)] hover:border-[var(--primary)]/30 transition-all group">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded bg-[var(--primary)]/10 flex items-center justify-center">
                                                <Terminal className="w-3.5 h-3.5 text-[var(--primary)]" />
                                            </div>
                                            <span className="text-[11px] font-bold uppercase tracking-wider truncate max-w-[150px]">{q.name}</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => deleteSavedQuery(q.id)}
                                            className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--error)] opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    <pre className="text-[9px] font-mono bg-[var(--muted)]/20 p-2 rounded mb-3 max-h-20 overflow-hidden line-clamp-3 text-[var(--muted-foreground)]">
                                        {q.query}
                                    </pre>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setQuery(q.query);
                                            setActiveTab('editor');
                                            executeQuery(q.query);
                                        }}
                                        className="w-full h-8 text-[9px] font-bold uppercase tracking-wider border-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                    >
                                        <Play className="w-3 h-3 mr-2" />
                                        Load & Run
                                    </Button>
                                </Card>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="space-y-2 animate-fade-in">
                        {history.length === 0 ? (
                            <div className="py-12 text-center space-y-4 border border-dashed border-[var(--border)] rounded-2xl bg-[var(--muted)]/5">
                                <History className="w-8 h-8 text-[var(--muted-foreground)]/30 mx-auto" />
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Query history is empty</p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">Your recently executed queries will appear here</p>
                                </div>
                            </div>
                        ) : (
                            <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background)]">
                                {history.map((h, i) => (
                                    <div
                                        key={h.id}
                                        className={`p-3 flex items-center justify-between group hover:bg-[var(--muted)]/10 transition-colors ${i !== history.length - 1 ? 'border-b border-[var(--border)]' : ''}`}
                                    >
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="flex flex-col items-center shrink-0">
                                                <Clock className="w-3.5 h-3.5 text-[var(--muted-foreground)]/50" />
                                                <div className="h-4 w-[1px] bg-[var(--border)] my-1" />
                                            </div>
                                            <div className="space-y-1 flex-1">
                                                <div className="flex items-center gap-3">
                                                    <code className="text-[10px] font-mono text-[var(--foreground)] line-clamp-1">{h.query}</code>
                                                    {h.error && <span className="text-[8px] font-bold uppercase bg-[var(--error)]/10 text-[var(--error)] px-1 rounded">Error</span>}
                                                </div>
                                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/60">
                                                    {new Date(h.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setQuery(h.query);
                                                setActiveTab('editor');
                                                executeQuery(h.query);
                                            }}
                                            className="h-8 px-3 text-[9px] font-bold uppercase tracking-wider text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <ChevronRight className="w-3.5 h-3.5 mr-1" />
                                            Re-run
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {showInsights && performanceData && (
                    <div className="p-4 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20 animate-fade-in grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="md:col-span-1 space-y-4">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-[var(--primary)]" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Historical Performance</span>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Uptime / Success</span>
                                    <span className="text-lg font-semibold text-[var(--success)]">{performanceData.successRate}%</span>
                                </div>
                                <div>
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Avg Execution</span>
                                    <span className="text-lg font-semibold text-[var(--primary)]">{performanceData.avgLatency}ms</span>
                                </div>
                                <div>
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Queries (Last 100)</span>
                                    <span className="text-lg font-semibold text-[var(--foreground)]">{performanceData.totalQueries}</span>
                                </div>
                            </div>
                        </div>
                        <div className="md:col-span-3 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Response Time Trend</span>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--muted)]/20 px-1.5 py-0.5 rounded">Last 7 Days</span>
                            </div>
                            <div className="h-24 flex items-end gap-1.5">
                                {(performanceData.timeseries || []).map((day, i) => (
                                    <div key={i} className="flex-1 group relative">
                                        <div
                                            className="w-full bg-[var(--primary)]/40 hover:bg-[var(--primary)] transition-colors rounded-t-sm"
                                            style={{ height: `${Math.min(100, (day.avgLatency / 100) * 100)}%` }}
                                        />
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--popover)] text-[10px] font-bold px-2 py-1 rounded shadow-lg border border-[var(--border)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                            {day.date}: {Math.round(day.avgLatency)}ms
                                        </div>
                                    </div>
                                ))}
                                {(!performanceData.timeseries || performanceData.timeseries.length === 0) && (
                                    <div className="w-full h-full flex items-center justify-center border border-dashed border-[var(--border)] rounded-lg">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Insufficient Data</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between">
                                {(performanceData.timeseries || []).map((day, i) => (
                                    <span key={i} className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">
                                        {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {schema && (
                    <div className="p-4 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20 animate-fade-in">
                        <div className="flex items-center gap-2 mb-3">
                            <Info className="w-4 h-4 text-[var(--primary)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Schema Insight</span>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Entities</span>
                                <div className="flex flex-wrap gap-2">
                                    {(schema.tables || schema.collections || []).map(item => (
                                        <button
                                            key={item}
                                            onClick={() => {
                                                if (selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale') {
                                                    setQuery(`SELECT * FROM ${item} LIMIT 10`);
                                                } else {
                                                    setQuery(`{ "collection": "${item}", "limit": 10 }`);
                                                }
                                            }}
                                            className="px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[10px] font-mono hover:border-[var(--primary)] transition-colors flex items-center gap-2 group"
                                        >
                                            {item}
                                            <ChevronRight className="w-3 h-3 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {schema.columns && Object.keys(schema.columns).length > 0 && (
                                <div className="space-y-3 border-l border-[var(--border)] pl-4">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Structure Preview</span>
                                    <div className="max-h-40 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                                        {Object.entries(schema.columns).map(([table, cols]) => (
                                            <div key={table} className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <Table className="w-3 h-3 text-[var(--primary)]" />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">{table}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 pl-5">
                                                    {cols.map(c => (
                                                        <div key={c.name} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--muted)]/20 border border-[var(--border)]">
                                                            <span className="text-[9px] font-mono">{c.name}</span>
                                                            <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] opacity-60">{c.type}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3 text-[var(--error)]">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{error}</span>
                    </div>
                )}

                {results && (
                    <div className="space-y-3 animate-fade-in">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--success)]">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Query Executed Successfully ({results.length} results)
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={downloadCSV}
                                    className="h-6 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                >
                                    <Download className="w-3.5 h-3.5 mr-1.5" />
                                    Export CSV
                                </Button>
                            </div>
                            <div className="flex items-center gap-1 bg-[var(--muted)]/20 p-1 rounded-lg border border-[var(--border)]">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setViewMode('table')}
                                    className={`h-7 px-3 text-[10px] font-bold uppercase tracking-wider ${viewMode === 'table' ? 'bg-[var(--background)] shadow-sm text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}
                                >
                                    <Table className="w-3.5 h-3.5 mr-1.5" />
                                    Table
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setViewMode('json')}
                                    className={`h-7 px-3 text-[10px] font-bold uppercase tracking-wider ${viewMode === 'json' ? 'bg-[var(--background)] shadow-sm text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}
                                >
                                    <Terminal className="w-3.5 h-3.5 mr-1.5" />
                                    JSON
                                </Button>
                            </div>
                        </div>
                        <div className="max-h-[400px] overflow-auto">
                            {viewMode === 'table' ? (
                                renderResultsTable()
                            ) : (
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/10 p-4">
                                    <pre className="text-[10px] font-mono text-[var(--foreground)]">
                                        {JSON.stringify(results, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="p-4 bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-xl flex items-start gap-3">
                    <Database className="w-4 h-4 text-[var(--info)] shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-relaxed">
                        Data Lab uses a secure proxy to execute read-only commands against your connected infrastructure. Your credentials never leave our VPC.
                    </p>
                </div>
            </div>

            {/* Save Query Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                                    <Save className="w-4 h-4 text-[var(--primary)]" />
                                </div>
                                <h3 className="text-lg font-semibold">Save Query</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowSaveModal(false)} className="h-8 w-8">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Query Name</Label>
                                <Input
                                    value={newQueryName}
                                    onChange={(e) => setNewQueryName(e.target.value)}
                                    placeholder="E.G. ACTIVE USERS"
                                    className="placeholder:text-[9px]"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">SQL/JSON Code</Label>
                                <pre className="p-3 bg-[var(--muted)]/20 rounded-lg text-[10px] font-mono line-clamp-4 text-[var(--muted-foreground)]">
                                    {query}
                                </pre>
                            </div>
                        </div>
                        <div className="p-6 bg-[var(--muted)]/5 border-t border-[var(--border)] flex justify-end gap-3">
                            <Button variant="ghost" size="sm" onClick={() => setShowSaveModal(false)} className="text-[10px] font-bold uppercase tracking-wider">
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={saveQuery}
                                disabled={isSavingQuery || !newQueryName.trim()}
                                className="text-[10px] font-bold uppercase tracking-wider bg-[var(--primary)]"
                            >
                                {isSavingQuery ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Save className="w-3.5 h-3.5 mr-2" />}
                                Save Query
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </Card>
    );
}
