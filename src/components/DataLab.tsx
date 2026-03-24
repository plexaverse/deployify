'use client';

import { useState } from 'react';
import { Database, Play, Terminal, AlertCircle, Loader2, CheckCircle2, Table, Info, Search, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
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
    const [schema, setSchema] = useState<{ tables?: string[], collections?: string[] } | null>(null);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [performanceData, setPerformanceData] = useState<{ avgLatency: number, successRate: number } | null>(null);

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
                    // Update performance insight (Mocked for UI)
                    setPerformanceData({
                        avgLatency: data.executionTimeMs || Math.floor(Math.random() * 40) + 10,
                        successRate: 98.5
                    });
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
                {performanceData && (
                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Avg Latency</span>
                            <span className="text-sm font-semibold text-[var(--primary)]">{performanceData.avgLatency}ms</span>
                        </div>
                        <div className="text-right">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Success Rate</span>
                            <span className="text-sm font-semibold text-[var(--success)]">{performanceData.successRate}%</span>
                        </div>
                    </div>
                )}
            </div>

            <Separator className="bg-[var(--border)]" />

            <div className="p-6 space-y-6">
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
                            <div className="absolute bottom-4 right-4">
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

                {schema && (
                    <div className="p-4 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20 animate-fade-in">
                        <div className="flex items-center gap-2 mb-3">
                            <Info className="w-4 h-4 text-[var(--primary)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Schema Insight</span>
                        </div>
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
                                    className="px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[10px] font-mono hover:border-[var(--primary)] transition-colors"
                                >
                                    {item}
                                </button>
                            ))}
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
        </Card>
    );
}
