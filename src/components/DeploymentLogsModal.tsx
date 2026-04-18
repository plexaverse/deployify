'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Terminal } from 'lucide-react';
import { DeploymentTimeline } from '@/components/DeploymentTimeline';
import { BuildLogViewer } from '@/components/BuildLogViewer';
import type { Deployment } from '@/types';
import { Portal } from '@/components/ui/portal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';

interface DeploymentLogsModalProps {
    deployment: Deployment;
    isOpen: boolean;
    onClose: () => void;
}

export function DeploymentLogsModal({ deployment, isOpen, onClose }: DeploymentLogsModalProps) {
    const [logs, setLogs] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchLogs = useCallback(async (isPolling = false) => {
        if (!deployment.id || !deployment.projectId) return;

        if (!isPolling) setLoading(true);
        // Always clear error when manually fetching or retrying to ensure UI updates
        if (!isPolling) setError(null);

        try {
            const res = await fetch(`/api/projects/${deployment.projectId}/deployments/${deployment.id}/logs`);
            const data = await res.json();
            if (res.ok) {
                setLogs(data.logs);
            } else {
                if (!isPolling) setError(data.error || 'Failed to fetch logs');
            }
        } catch {
            if (!isPolling) setError('Failed to fetch logs');
        } finally {
            if (!isPolling) setLoading(false);
        }
    }, [deployment.projectId, deployment.id]);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isOpen && deployment.id && deployment.projectId) {
            fetchLogs();

            // Poll if building or queued
            if (deployment.status === 'building' || deployment.status === 'queued') {
                interval = setInterval(() => fetchLogs(true), 3000);
            }
        } else {
            setLogs(null);
            setError(null);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isOpen, deployment.id, deployment.projectId, deployment.status, fetchLogs]);

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                <Card className="w-full max-w-5xl h-[85vh] p-0 overflow-hidden animate-fade-in shadow-2xl flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                <Terminal className="w-5 h-5 text-[var(--primary)]" />
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Runtime Diagnostics</span>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-[10px] font-bold tracking-tight text-[var(--foreground)]">Build Logs</h3>
                                    <StatusBadge status={deployment.status} />
                                </div>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-8 w-8 rounded-full"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Timeline */}
                    <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
                        <DeploymentTimeline deployment={deployment} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden bg-[var(--terminal-bg)] relative">
                        <BuildLogViewer
                            logs={logs}
                            loading={loading && !logs}
                            error={error}
                            onRetry={() => fetchLogs()}
                        />
                    </div>
                </Card>
            </div>
        </Portal>
    );
}
