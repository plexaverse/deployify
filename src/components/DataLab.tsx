'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Database, Play, Terminal, AlertCircle, Loader2, CheckCircle2, Table, Info, Search, Download, BarChart2, TrendingUp, History, Save, Trash2, Clock, ChevronRight, X, AlertTriangle, FileCode, ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { QueryEditor } from '@/components/ui/query-editor';
import type { StorageConfig } from '@/types';

interface DataLabProps {
    projectId: string;
    connectors: StorageConfig[];
}

const ROWS_PER_PAGE = 10;

export function DataLab({ projectId, connectors }: DataLabProps) {
    const currentUserId = connectors[0]?.metadata?.userId as string | undefined;
    const [selectedId, setSelectedId] = useState(connectors[0]?.id || '');
    const [query, setQuery] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [isExplaining, setIsExplaining] = useState(false);
    const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
    const [rowCount, setRowCount] = useState<number | null>(null);
    const [executionTime, setExecutionTime] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
    const [schema, setSchema] = useState<{ tables?: string[], collections?: string[], columns?: Record<string, { name: string, type: string, isPrimary?: boolean, references?: string }[]> } | null>(null);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [performanceData, setPerformanceData] = useState<{
        avgLatency: number,
        successRate: number,
        totalQueries?: number,
        timeseries?: { date: string, avgLatency: number }[],
        hotspots?: { query: string, avgLatency: number, count: number }[]
    } | null>(null);
    const [showInsights, setShowInsights] = useState(false);
    const [history, setHistory] = useState<{ id: string, query: string, timestamp: string, executionTimeMs?: number, rowCount?: number, error?: string }[]>([]);
    const [savedQueries, setSavedQueries] = useState<{ id: string, name: string, query: string, isPublic?: boolean, userId?: string }[]>([]);
    const [isSavingQuery, setIsSavingQuery] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [newQueryName, setNewQueryName] = useState('');
    const [isQueryPublic, setIsQueryPublic] = useState(false);
    const [activeTab, setActiveTab] = useState<'editor' | 'history' | 'saved'>('editor');
    const [currentPage, setCurrentPage] = useState(1);
    const [queryParams, setQueryParams] = useState<Record<string, string>>({});

    const detectedParams = useMemo(() => {
        const matches = query.match(/:\w+/g);
        return matches ? Array.from(new Set(matches.map(m => m.substring(1)))) : [];
    }, [query]);

    useEffect(() => {
        // Initialize or remove query params based on detection
        setQueryParams(prev => {
            const next = { ...prev };
            // Remove params no longer in query
            Object.keys(next).forEach(key => {
                if (!detectedParams.includes(key)) delete next[key];
            });
            // Add new params with empty value
            detectedParams.forEach(param => {
                if (next[param] === undefined) next[param] = '';
            });
            return next;
        });
    }, [detectedParams]);

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

    const executeQuery = async (overrideQuery?: string, explain = false) => {
        let queryToRun = overrideQuery || query;
        if (!selectedId || !queryToRun.trim()) return;

        // Apply parameters if not DISCOVER_SCHEMA
        if (queryToRun !== 'DISCOVER_SCHEMA') {
            Object.entries(queryParams).forEach(([key, val]) => {
                const regex = new RegExp(`:${key}\\b`, 'g');
                // For SQL, we should ideally use parameterized queries in the backend,
                // but for this experimental proxy we'll do safe string replacement for now.
                // In a production SQL driver, we would pass these as separate values.
                const escapedVal = typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val;
                queryToRun = queryToRun.replace(regex, escapedVal);
            });
        }

        if (explain) {
            queryToRun = `EXPLAIN ${queryToRun}`;
            setIsExplaining(true);
        } else {
            setIsExecuting(true);
        }

        if (!overrideQuery) setError(null);
        if (!overrideQuery) {
            setResults(null);
            setRowCount(null);
            setExecutionTime(null);
        }
        setCurrentPage(1);

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
                    setRowCount(data.rowCount);
                    setExecutionTime(data.executionTimeMs);
                    // Re-fetch historical metrics and history after execution
                    if (!explain) {
                        fetchMetrics();
                        fetchHistory();
                    }
                }
            } else {
                setError(data.error || 'Failed to execute query');
            }
        } catch {
            setError('Network error: Failed to connect to proxy');
        } finally {
            setIsExecuting(false);
            setIsExplaining(false);
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
                body: JSON.stringify({ name: newQueryName, query, isPublic: isQueryPublic }),
            });
            const data = await response.json();
            if (data.success) {
                setShowSaveModal(false);
                setNewQueryName('');
                setIsQueryPublic(false);
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

    const downloadJSON = () => {
        if (!results || results.length === 0) return;

        const jsonContent = JSON.stringify(results, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `datalab-export-${new Date().toISOString().split('T')[0]}.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportTypeScript = () => {
        if (!schema || !schema.columns) return;

        let tsContent = '// Generated by Deployify Data Lab\n\n';

        Object.entries(schema.columns).forEach(([table, cols]) => {
            const interfaceName = table.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('') + 'Row';
            tsContent += `export interface ${interfaceName} {\n`;
            cols.forEach(col => {
                let tsType = 'any';
                const lowerType = col.type.toLowerCase();
                if (lowerType.includes('int') || lowerType.includes('float') || lowerType.includes('decimal') || lowerType.includes('numeric') || lowerType === 'number') {
                    tsType = 'number';
                } else if (lowerType.includes('char') || lowerType.includes('text') || lowerType.includes('string')) {
                    tsType = 'string';
                } else if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp')) {
                    tsType = 'Date | string';
                } else if (lowerType.includes('bool')) {
                    tsType = 'boolean';
                } else if (lowerType === 'object') {
                    tsType = 'Record<string, unknown>';
                }
                tsContent += `    ${col.name}: ${tsType};\n`;
            });
            tsContent += '}\n\n';
        });

        const blob = new Blob([tsContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `database-types-${new Date().toISOString().split('T')[0]}.ts`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const clearResults = () => {
        setResults(null);
        setRowCount(null);
        setExecutionTime(null);
        setError(null);
        setCurrentPage(1);
    };

    const selectedConnector = connectors.find(c => c.id === selectedId);

    const paginatedResults = useMemo(() => {
        if (!results) return null;
        const start = (currentPage - 1) * ROWS_PER_PAGE;
        const end = start + ROWS_PER_PAGE;
        return results.slice(start, end);
    }, [results, currentPage]);

    const totalPages = results ? Math.ceil(results.length / ROWS_PER_PAGE) : 0;

    const renderResultsTable = () => {
        if (!paginatedResults || paginatedResults.length === 0) return null;
        const columns = Object.keys(paginatedResults[0]);

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
                        {paginatedResults.map((row, i) => (
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
                                {selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale' ? 'SQL Query (Read-Only)' : 'NoSQL Filter / JSON'}
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
                            <QueryEditor
                                value={query}
                                onChange={setQuery}
                                placeholder={
                                    selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale'
                                        ? "SELECT * FROM users LIMIT 10"
                                        : selectedConnector?.type === 'memorystore-redis'
                                            ? "GET user:1  OR  { \"command\": \"hgetall\", \"args\": [\"user:1\"] }"
                                            : "{ \"collection\": \"users\", \"limit\": 10 }"
                                }
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
                                {(selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale') && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => executeQuery(undefined, true)}
                                        disabled={isExplaining || isExecuting || !query.trim()}
                                        className="h-10 px-4 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                    >
                                        {isExplaining ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Info className="w-4 h-4 mr-2" />}
                                        Explain
                                    </Button>
                                )}
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

                        {detectedParams.length > 0 && (
                            <div className="p-4 rounded-xl bg-[var(--muted)]/20 border border-[var(--border)] animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-2 mb-3">
                                    <Terminal className="w-3.5 h-3.5 text-[var(--primary)]" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Query Parameters</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {detectedParams.map(param => (
                                        <div key={param} className="space-y-1.5">
                                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">:{param}</Label>
                                            <Input
                                                value={queryParams[param] || ''}
                                                onChange={(e) => setQueryParams(prev => ({ ...prev, [param]: e.target.value }))}
                                                placeholder={`VALUE FOR ${param.toUpperCase()}`}
                                                className="h-8 text-[10px] font-mono"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold uppercase tracking-wider truncate max-w-[150px]">{q.name}</span>
                                                {q.isPublic && <span className="text-[8px] font-bold uppercase text-[var(--success)] tracking-tight">Team Shared</span>}
                                            </div>
                                        </div>
                                        {(!q.isPublic || q.userId === currentUserId) && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => deleteSavedQuery(q.id)}
                                                className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--error)] opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                    <pre className="text-[10px] font-mono bg-[var(--muted)]/20 p-2 rounded mb-3 max-h-20 overflow-hidden line-clamp-3 text-[var(--muted-foreground)]">
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
                                        className="w-full h-8 text-[10px] font-bold uppercase tracking-wider border-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/10"
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
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/60">
                                                        {new Date(h.timestamp).toLocaleString()}
                                                    </span>
                                                    {h.executionTimeMs !== undefined && (
                                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]/60">
                                                            {h.executionTimeMs}ms
                                                        </span>
                                                    )}
                                                    {h.rowCount !== undefined && (
                                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--success)]/60">
                                                            {h.rowCount} rows
                                                        </span>
                                                    )}
                                                </div>
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
                                            className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity"
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
                    <div className="p-4 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20 animate-fade-in space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--muted)]/20 px-1.5 py-0.5 rounded">Last 7 Days</span>
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

                      {performanceData.hotspots && performanceData.hotspots.length > 0 && (
                          <div className="pt-4 border-t border-[var(--primary)]/10 space-y-3">
                              <div className="flex items-center gap-2">
                                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--error)]" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)]">Performance Hotspots (Slow Queries)</span>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                  {performanceData.hotspots.map((h, i) => (
                                      <div key={i} className="p-2 rounded bg-[var(--background)] border border-[var(--border)] flex items-center justify-between group">
                                          <div className="flex items-center gap-3 overflow-hidden">
                                              <span className="text-[10px] font-bold text-[var(--muted-foreground)] bg-[var(--muted)]/20 px-1.5 py-0.5 rounded shrink-0">{h.count}X</span>
                                              <code className="text-[10px] font-mono truncate text-[var(--foreground)]">{h.query}</code>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0">
                                              <span className="text-[10px] font-bold text-[var(--error)]">{h.avgLatency}ms</span>
                                              <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                      setQuery(h.query);
                                                      setActiveTab('editor');
                                                  }}
                                                  className="h-6 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity"
                                              >
                                                  Optimize
                                              </Button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                    </div>
                )}

                {schema && (
                    <div className="p-4 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20 animate-fade-in">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Info className="w-4 h-4 text-[var(--primary)]" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Schema Insight</span>
                            </div>
                            {schema.columns && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={exportTypeScript}
                                    className="h-6 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                >
                                    <FileCode className="w-3 h-3 mr-1.5" />
                                    Export Types (TS)
                                </Button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Entities</span>
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
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Structure Preview</span>
                                    <div className="max-h-40 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                                        {Object.entries(schema.columns).map(([table, cols]) => (
                                            <div key={table} className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <Table className="w-3 h-3 text-[var(--primary)]" />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">{table}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 pl-5">
                                                    {cols.map(c => (
                                                        <div key={c.name} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded border transition-colors ${c.isPrimary ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30' : 'bg-[var(--muted)]/20 border-[var(--border)]'}`}>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[10px] font-mono font-bold">{c.name}</span>
                                                                {c.isPrimary && <span className="text-[7px] font-black text-[var(--primary)] bg-[var(--primary)]/10 px-0.5 rounded">PK</span>}
                                                            </div>
                                                            <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] opacity-60">{c.type}</span>
                                                            {c.references && (
                                                                <div className="flex items-center gap-1 text-[7px] font-black text-[var(--success)] bg-[var(--success)]/10 px-1 rounded ml-1">
                                                                    <span>FK → {c.references.toUpperCase()}</span>
                                                                </div>
                                                            )}
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
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--success)]">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Query Executed Successfully
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                            Rows: <span className="text-[var(--success)]">{rowCount ?? results.length}</span>
                                        </span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                            Time: <span className="text-[var(--primary)]">{executionTime}ms</span>
                                        </span>
                                    </div>
                                </div>
                                <Separator orientation="vertical" className="h-8 bg-[var(--border)]" />
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={downloadCSV}
                                        className="h-6 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                    >
                                        <Download className="w-3.5 h-3.5 mr-1.5" />
                                        CSV
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={downloadJSON}
                                        className="h-6 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                    >
                                        <Terminal className="w-3.5 h-3.5 mr-1.5" />
                                        JSON
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={clearResults}
                                        className="h-6 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--error)] hover:bg-[var(--error)]/10"
                                    >
                                        <X className="w-3.5 h-3.5 mr-1.5" />
                                        Clear
                                    </Button>
                                </div>
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
                                <>
                                    {renderResultsTable()}
                                    {totalPages > 1 && (
                                        <div className="mt-4 flex items-center justify-between px-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                Page {currentPage} of {totalPages}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={currentPage === 1}
                                                    onClick={() => setCurrentPage(prev => prev - 1)}
                                                    className="h-7 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"
                                                >
                                                    <ChevronLeft className="w-4 h-4 mr-1" />
                                                    Previous
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={currentPage === totalPages}
                                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                                    className="h-7 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"
                                                >
                                                    Next
                                                    <ChevronRight className="w-4 h-4 ml-1" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
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
                                    className="placeholder:text-[10px]"
                                    autoFocus
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                <div className="space-y-0.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider">Share with Team</Label>
                                    <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]/60">Allow other team members to use this query</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={isQueryPublic}
                                    onChange={(e) => setIsQueryPublic(e.target.checked)}
                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
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
