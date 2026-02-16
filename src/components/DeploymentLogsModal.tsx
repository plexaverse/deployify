'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { DeploymentTimeline } from '@/components/DeploymentTimeline';
import { BuildLogViewer } from '@/components/BuildLogViewer';
import type { Deployment } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
        if (!isPolling) setLoading(true);
        // Don't clear error if polling, to avoid flashing
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

        if (isOpen && deployment.id) {
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
    }, [isOpen, deployment.id, deployment.status, fetchLogs]);

    if (!isOpen) return null;

    const getBadgeVariant = (status: string) => {
        switch (status) {
            case 'ready': return 'success';
            case 'error': return 'error';
            case 'building': return 'warning';
            default: return 'info';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--background)]">
                    <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">Build Logs</h3>
                        <Badge variant={getBadgeVariant(deployment.status)}>
                            {deployment.status}
                        </Badge>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="p-2 h-auto hover:bg-[var(--border)] rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* Timeline */}
                <div className="px-6 py-2 border-b border-[var(--border)] bg-[var(--background)]">
                    <DeploymentTimeline deployment={deployment} />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden bg-[#0d1117]">
                    <BuildLogViewer
                        logs={logs}
                        loading={loading && !logs}
                        error={error}
                        onRetry={() => fetchLogs()}
                    />
                </div>
            </div>
        </div>
    );
}
