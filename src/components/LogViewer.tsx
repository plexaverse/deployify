'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Loader2,
    Pause,
    Play,
    Trash2,
    ArrowDown,
    Activity,
    Wifi,
    WifiOff
} from 'lucide-react';

// Define LogEntry interface locally to avoid importing server-side code
interface LogEntry {
    timestamp: string;
    severity: string;
    textPayload?: string;
    jsonPayload?: Record<string, unknown>;
    resource: {
        type: string;
        labels: Record<string, string>;
    };
    logName: string;
    insertId?: string;
}

interface LogViewerProps {
    projectId: string;
    className?: string;
}

export function LogViewer({ projectId, className }: LogViewerProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

    const isPausedRef = useRef(isPaused);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    useEffect(() => {
        const url = `/api/projects/${projectId}/logs?stream=true`;
        const eventSource = new EventSource(url);

        eventSource.onopen = () => {
            setIsConnected(true);
            setError(null);
        };

        eventSource.onmessage = (event) => {
            if (isPausedRef.current) return;

            try {
                const data = JSON.parse(event.data);
                // Check if it's an error message from server
                if (data.error) {
                    console.error('Server sent error:', data.error);
                    setError(data.error);
                    return;
                }

                setLogs(prev => {
                    // Avoid duplicates if needed
                    const exists = prev.some(l => l.insertId === data.insertId && l.timestamp === data.timestamp);
                    if (exists) return prev;
                    return [...prev, data as LogEntry];
                });
            } catch (e) {
                console.error('Failed to parse log entry:', e);
            }
        };

        eventSource.onerror = (e) => {
            console.error('EventSource error:', e);
            setIsConnected(false);
        };

        eventSource.addEventListener('error', (e: MessageEvent) => {
             if (e.data) {
                try {
                    const errData = JSON.parse(e.data);
                    if (errData.error) {
                        setError(errData.error);
                    }
                } catch {}
             }
        });

        return () => {
            eventSource.close();
        };
    }, [projectId]);

    // Auto-scroll logic
    useEffect(() => {
        if (shouldAutoScroll && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, shouldAutoScroll]);

    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        // If user scrolls up, disable auto-scroll
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        setShouldAutoScroll(isAtBottom);
    };

    const clearLogs = () => setLogs([]);

    const getSeverityColor = (severity: string) => {
        switch (severity?.toUpperCase()) {
            case 'ERROR':
            case 'CRITICAL':
            case 'EMERGENCY':
            case 'ALERT':
                return 'text-red-500';
            case 'WARNING':
                return 'text-yellow-500';
            case 'INFO':
            case 'NOTICE':
                return 'text-blue-400';
            case 'DEBUG':
                return 'text-gray-400';
            default:
                return 'text-gray-300';
        }
    };

    const formatTimestamp = (isoString: string) => {
        try {
            return new Date(isoString).toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 3
            });
        } catch {
            return isoString;
        }
    };

    return (
        <div className={`flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-sm ${className || ''}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-[var(--border)] bg-[var(--muted)]/30">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[var(--foreground)]" />
                        <h3 className="font-medium text-sm">Runtime Logs</h3>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        isConnected
                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                    }`}>
                        {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsPaused(!isPaused)}
                        className="p-1.5 hover:bg-[var(--muted)] rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                        title={isPaused ? "Resume auto-scroll" : "Pause auto-scroll"}
                    >
                        {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={clearLogs}
                        className="p-1.5 hover:bg-[var(--muted)] rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                        title="Clear logs"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-500/10 text-red-500 px-4 py-2 text-xs border-b border-red-500/20">
                    Error: {error}
                </div>
            )}

            {/* Logs Area */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 h-[400px] overflow-y-auto p-4 bg-[#0d1117] font-mono text-xs relative"
            >
                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                        {isConnected ? (
                            <>
                                <Loader2 className="w-6 h-6 animate-spin opacity-50" />
                                <p>Waiting for logs...</p>
                            </>
                        ) : (
                            <p>No logs available</p>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {logs.map((log, index) => (
                            <div key={log.insertId || index} className="flex items-start gap-3 hover:bg-white/5 p-0.5 rounded px-2 -mx-2">
                                <span className="text-gray-500 shrink-0 select-none w-24">
                                    {formatTimestamp(log.timestamp)}
                                </span>
                                <span className={`font-bold shrink-0 w-16 select-none ${getSeverityColor(log.severity)}`}>
                                    {log.severity}
                                </span>
                                <span className="text-gray-300 break-all whitespace-pre-wrap">
                                    {log.textPayload || (log.jsonPayload ? JSON.stringify(log.jsonPayload) : '')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                <div ref={logsEndRef} />

                {/* Scroll to bottom button */}
                {!shouldAutoScroll && logs.length > 0 && (
                    <button
                        onClick={() => {
                            setShouldAutoScroll(true);
                            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="absolute bottom-4 right-4 bg-[var(--primary)] text-[var(--primary-foreground)] p-2 rounded-full shadow-lg hover:opacity-90 transition-opacity z-10"
                    >
                        <ArrowDown className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
