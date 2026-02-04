'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';

interface DeploymentLogsModalProps {
    projectId: string;
    deploymentId: string;
    isOpen: boolean;
    onClose: () => void;
    status?: string;
}

export function DeploymentLogsModal({ projectId, deploymentId, isOpen, onClose, status }: DeploymentLogsModalProps) {
    const [logs, setLogs] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const fetchLogs = useCallback(async (isPolling = false) => {
        if (!isPolling) setLoading(true);
        // Don't clear error if polling, to avoid flashing
        if (!isPolling) setError(null);

        try {
            const res = await fetch(`/api/projects/${projectId}/deployments/${deploymentId}/logs`);
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
    }, [projectId, deploymentId]);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isOpen && deploymentId) {
            fetchLogs();

            // Poll if building or queued
            if (status === 'building' || status === 'queued') {
                interval = setInterval(() => fetchLogs(true), 3000);
            }
        } else {
            setLogs(null);
            setError(null);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isOpen, deploymentId, status, fetchLogs]);

    // Auto-scroll to bottom when logs update
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--background)]">
                    <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">Build Logs</h3>
                        {status && (
                             <span className={`badge ${
                                status === 'ready' ? 'badge-success' :
                                status === 'error' ? 'badge-error' :
                                status === 'building' ? 'badge-warning' : 'badge-info'
                            }`}>
                                {status}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[var(--border)] rounded-md transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4 bg-[#0d1117] font-mono text-xs md:text-sm text-gray-300">
                    {loading && !logs ? (
                        <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)]">
                            <Loader2 className="w-8 h-8 animate-spin mb-4" />
                            <p>Fetching build logs...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full text-[var(--error)]">
                            <p>{error}</p>
                            <button onClick={() => fetchLogs()} className="btn btn-secondary mt-4">Retry</button>
                        </div>
                    ) : (
                        <>
                            <pre className="whitespace-pre-wrap">{logs || 'No logs available.'}</pre>
                            <div ref={logsEndRef} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
