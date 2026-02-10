'use client';

import { useState, useEffect } from 'react';
import { Loader2, Activity, User as UserIcon } from 'lucide-react';
import type { AuditEvent } from '@/types';

interface AuditLogViewerProps {
    projectId: string;
}

export function AuditLogViewer({ projectId }: AuditLogViewerProps) {
    const [logs, setLogs] = useState<AuditEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchLogs() {
            try {
                const res = await fetch(`/api/projects/${projectId}/audit`);
                const data = await res.json();
                if (data.logs) {
                    setLogs(data.logs);
                }
            } catch (error) {
                console.error('Failed to fetch audit logs:', error);
            } finally {
                setIsLoading(false);
            }
        }

        fetchLogs();
    }, [projectId]);

    const formatAction = (action: string) => {
        return action.replace(/_/g, ' ').replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const formatDate = (date: string | Date) => {
        return new Date(date).toLocaleString();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
            </div>
        );
    }

    return (
        <div className="card">
            <div className="flex items-center gap-2 mb-6">
                <Activity className="w-5 h-5 text-[var(--primary)]" />
                <div>
                    <h2 className="text-lg font-semibold">Audit Logs</h2>
                    <p className="text-sm text-[var(--muted-foreground)]">
                        History of actions performed on this project
                    </p>
                </div>
            </div>

            {logs.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-[var(--border)] rounded-md">
                    <div className="bg-[var(--muted)] w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Activity className="w-6 h-6 text-[var(--muted-foreground)]" />
                    </div>
                    <p className="text-[var(--muted-foreground)]">No activity recorded yet</p>
                </div>
            ) : (
                <div className="border border-[var(--border)] rounded-md divide-y divide-[var(--border)] bg-[var(--background)]">
                    {logs.map((log) => (
                        <div key={log.id} className="p-4 hover:bg-[var(--muted)]/20 transition-colors">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-[var(--foreground)]">
                                            {formatAction(log.action)}
                                        </p>
                                        <span className="text-xs bg-[var(--muted)] px-1.5 py-0.5 rounded text-[var(--muted-foreground)] font-mono">
                                            {log.action}
                                        </span>
                                    </div>

                                    {/* Details */}
                                    <div className="text-xs text-[var(--muted-foreground)] font-mono bg-[var(--muted)]/30 p-2 rounded mt-2">
                                        {Object.entries(log.details).map(([key, value]) => {
                                            if (key === 'projectId' || key === 'userId') return null;
                                            return (
                                                <div key={key} className="flex gap-2">
                                                    <span className="font-semibold text-[var(--muted-foreground)]">{key}:</span>
                                                    <span className="text-[var(--foreground)] break-all">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                                </div>
                                            );
                                        })}
                                        {Object.keys(log.details).filter(k => k !== 'projectId' && k !== 'userId').length === 0 && (
                                            <span className="italic text-[var(--muted-foreground)]">No additional details</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-1 text-xs text-[var(--muted-foreground)] min-w-[140px]">
                                    <span className="flex items-center gap-1 bg-[var(--muted)] px-2 py-1 rounded-full">
                                        <UserIcon className="w-3 h-3" />
                                        {/* In a real app we would resolve this ID to a name/email */}
                                        <span className="truncate max-w-[100px]" title={log.userId}>{log.userId.substring(0, 8)}...</span>
                                    </span>
                                    <span>{formatDate(log.createdAt)}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
