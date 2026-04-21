'use client';

import React from 'react';
import { Network, Server, Database, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

export interface RegionalProximityMapping {
    projectId: string;
    projectName: string;
    projectRegion: string;
    storageId: string;
    storageName: string;
    storageRegion: string;
    storageType: string;
    latencyMs: number;
    aligned: boolean;
}

interface ProximityMatrixProps {
    mappings: RegionalProximityMapping[];
}

export function ProximityMatrix({ mappings }: ProximityMatrixProps) {
    // Group mappings by region pairs
    const regionPairs = Array.from(new Set(mappings.map(m => `${m.projectRegion}:${m.storageRegion}`)));

    return (
        <Card className="p-6 bg-[var(--card)]/50 border-[var(--primary)]/10">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                    <Network className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Regional Alignment</span>
                    <h3 className="text-[10px] font-bold">Connectivity Proximity Matrix</h3>
                </div>
            </div>

            <div className="space-y-4">
                {mappings.length === 0 ? (
                    <div className="py-12 text-center border border-dashed border-[var(--border)] rounded-2xl opacity-40">
                        <span className="text-[8px] font-bold uppercase tracking-wider">No regional mapping data available</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {mappings.map((m, i) => (
                            <div
                                key={`${m.projectId}-${m.storageId}-${i}`}
                                className={cn(
                                    "p-4 rounded-xl border transition-all flex flex-col justify-between",
                                    m.aligned
                                        ? "bg-[var(--success)]/[0.02] border-[var(--success)]/10 hover:border-[var(--success)]/30"
                                        : "bg-[var(--error)]/[0.02] border-[var(--error)]/10 hover:border-[var(--error)]/30"
                                )}
                            >
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-bold uppercase tracking-tight truncate max-w-[120px]">{m.projectName}</span>
                                            {m.aligned ? (
                                                <CheckCircle2 className="w-3 h-3 text-[var(--success)]" />
                                            ) : (
                                                <AlertTriangle className="w-3 h-3 text-[var(--error)] animate-pulse" />
                                            )}
                                        </div>
                                        <span className={cn(
                                            "text-[8px] font-mono font-bold px-1.5 py-0.5 rounded",
                                            m.aligned ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--error)]/10 text-[var(--error)]"
                                        )}>
                                            {m.latencyMs}ms
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 relative">
                                        <div className="flex flex-col items-center gap-1 shrink-0">
                                            <div className="w-7 h-7 rounded-lg bg-[var(--muted)]/20 flex items-center justify-center">
                                                <Server className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                                            </div>
                                            <span className="text-[7px] font-bold uppercase text-[var(--muted-foreground)]">{m.projectRegion}</span>
                                        </div>

                                        <div className="flex-1 h-[1px] bg-gradient-to-r from-[var(--muted)]/20 via-[var(--primary)]/30 to-[var(--muted)]/20 relative">
                                            <div className={cn(
                                                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                                                !m.aligned && "animate-bounce"
                                            )}>
                                                <Zap className={cn("w-3 h-3", m.aligned ? "text-[var(--success)]" : "text-[var(--error)]")} />
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center gap-1 shrink-0">
                                            <div className="w-7 h-7 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                                                <Database className="w-3.5 h-3.5 text-[var(--primary)]" />
                                            </div>
                                            <span className="text-[7px] font-bold uppercase text-[var(--primary)]">{m.storageRegion}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                                    <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">{m.storageName}</span>
                                    <span className="text-[7px] font-mono text-[var(--muted-foreground)] opacity-50">{m.storageType.toUpperCase()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-6 flex items-start gap-2 p-3 bg-[var(--primary)]/5 border border-[var(--primary)]/10 rounded-xl">
                <Network className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-relaxed">
                    Regional alignment ensures minimum latency and eliminates cross-region egress costs. Values shown are estimated based on standard GCP intra-network benchmarks.
                </p>
            </div>
        </Card>
    );
}
