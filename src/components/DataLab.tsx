'use client';

import { useState } from 'react';
import { Database, Play, Terminal, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
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

    const executeQuery = async () => {
        if (!selectedId || !query.trim()) return;

        setIsExecuting(true);
        setError(null);
        setResults(null);

        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });

            const data = await response.json();
            if (data.success) {
                setResults(data.results);
            } else {
                setError(data.error || 'Failed to execute query');
            }
        } catch {
            setError('Network error: Failed to connect to proxy');
        } finally {
            setIsExecuting(false);
        }
    };

    const selectedConnector = connectors.find(c => c.id === selectedId);

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
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                            {selectedConnector?.type.includes('sql') ? 'SQL Query (Read-Only)' : 'NoSQL Filter / JSON'}
                        </Label>
                        <div className="relative">
                            <textarea
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={selectedConnector?.type.includes('sql') ? "SELECT * FROM users LIMIT 10" : "{ \"collection\": \"users\", \"limit\": 10 }"}
                                className="w-full h-32 p-4 rounded-xl bg-[var(--background)] border border-[var(--border)] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 resize-none"
                            />
                            <div className="absolute bottom-4 right-4">
                                <MovingBorderButton
                                    onClick={executeQuery}
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

                {error && (
                    <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3 text-[var(--error)]">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="text-xs font-semibold uppercase tracking-wider">{error}</span>
                    </div>
                )}

                {results && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--success)]">
                                <CheckCircle2 className="w-4 h-4" />
                                Query Executed Successfully ({results.length} results)
                            </div>
                        </div>
                        <div className="max-h-[300px] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--muted)]/10 p-4">
                            <pre className="text-[10px] font-mono text-[var(--foreground)]">
                                {JSON.stringify(results, null, 2)}
                            </pre>
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
