'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
    Loader2,
    Pause,
    Play,
    Trash2,
    Copy,
    Check,
    ArrowDown,
    Activity,
    Wifi,
    WifiOff,
    Search,
    X
} from 'lucide-react';
import { parseLogEntry, type LogEntry } from '@/lib/logging/parser';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/utils';

interface LogViewerProps {
    projectId: string;
    className?: string;
    revision?: string;
}

type LogTab = 'runtime' | 'system' | 'build';

export function LogViewer({ projectId, className, revision }: LogViewerProps) {
    const [activeTab, setActiveTab] = useState<LogTab>('runtime');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [severityFilter, setSeverityFilter] = useState<Set<string>>(new Set());

    const logsEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const [isLoading, setIsLoading] = useState(true);

    const isPausedRef = useRef(isPaused);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    // Reset logs when tab changes
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLogs([]);
        setIsLoading(true);
        setError(null);
        setShouldAutoScroll(true);
    }, [activeTab]);

    useEffect(() => {
        let url = `/api/projects/${projectId}/logs?stream=true&type=${activeTab}`;
        if (revision && activeTab !== 'build') {
            url += `&revision=${revision}`;
        }

        const eventSource = new EventSource(url);

        eventSource.onopen = () => {
            setIsConnected(true);
            setError(null);
            setIsLoading(false);
        };

        eventSource.onmessage = (event) => {
            if (isPausedRef.current) return;
            setIsLoading(false);

            try {
                const result = parseLogEntry(event.data);

                if (!result) return; // Parse error

                // Check if it's an error message from server
                if ('error' in result) {
                    console.error('Server sent error:', result.error);
                    setError(result.error);
                    return;
                }

                const data = result as LogEntry;

                setLogs(prev => {
                    // Avoid duplicates if needed
                    const exists = prev.some(l => l.insertId === data.insertId && l.timestamp === data.timestamp);
                    if (exists) return prev;
                    return [...prev, data];
                });
            } catch (e) {
                console.error('Failed to parse log entry:', e);
            }
        };

        eventSource.onerror = (e) => {
            console.error('EventSource error:', e);
            setIsConnected(false);
            // Don't set isLoading to true here as we might have logs already
        };

        eventSource.addEventListener('error', (e: MessageEvent) => {
            if (e.data) {
                try {
                    const errData = JSON.parse(e.data);
                    if (errData.error) {
                        setError(errData.error);
                    }
                } catch { }
            }
        });

        return () => {
            eventSource.close();
        };
    }, [projectId, revision, activeTab]);

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

    const [isCopying, setIsCopying] = useState(false);
    const copyLogs = async () => {
        if (logs.length === 0) return;
        setIsCopying(true);
        const text = filteredLogs.map(log =>
            `[${formatTimestamp(log.timestamp)}] ${log.severity.padEnd(7)} ${log.textPayload || (log.jsonPayload ? JSON.stringify(log.jsonPayload) : '')}`
        ).join('\n');

        try {
            await navigator.clipboard.writeText(text);
            setTimeout(() => setIsCopying(false), 2000);
        } catch (err) {
            console.error('Failed to copy logs:', err);
            setIsCopying(false);
        }
    };

    const toggleSeverityFilter = (severity: string) => {
        const next = new Set(severityFilter);
        if (next.has(severity)) {
            next.delete(severity);
        } else {
            next.add(severity);
        }
        setSeverityFilter(next);
    };

    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            // Severity filter
            if (severityFilter.size > 0 && !severityFilter.has(log.severity)) {
                return false;
            }

            // Text search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const textContent = log.textPayload?.toLowerCase() || '';
                const jsonContent = log.jsonPayload ? JSON.stringify(log.jsonPayload).toLowerCase() : '';
                return textContent.includes(query) || jsonContent.includes(query);
            }

            return true;
        });
    }, [logs, severityFilter, searchQuery]);

    const getSeverityColor = (severity: string) => {
        switch (severity?.toUpperCase()) {
            case 'ERROR':
            case 'CRITICAL':
            case 'EMERGENCY':
            case 'ALERT':
                return 'text-[var(--error)]';
            case 'WARNING':
                return 'text-[var(--warning)]';
            case 'INFO':
            case 'NOTICE':
                return 'text-[var(--info)]';
            case 'DEBUG':
                return 'text-[var(--muted)]';
            default:
                return 'text-[var(--muted-foreground)]';
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
        <div className={cn("flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-sm", className)}>
            {/* Header / Tabs */}
            <div className="flex flex-col border-b border-[var(--border)] bg-[var(--muted)]/30">
                <div className="flex items-center justify-between px-3 py-3">
                    <SegmentedControl
                        options={[
                            { value: 'runtime', label: 'Runtime Logs' },
                            { value: 'system', label: 'System Logs' },
                            { value: 'build', label: 'Build Logs' },
                        ]}
                        value={activeTab}
                        onChange={(v) => setActiveTab(v as LogTab)}
                    />

                    <Badge
                        variant={isConnected ? 'success' : 'destructive'}
                        className="text-[10px] py-0 px-2 h-5 gap-1.5"
                    >
                        {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between p-2 gap-2 border-t border-[var(--border)] bg-[var(--card)]">
                    <div className="flex items-center gap-2 flex-1">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                            <Input
                                type="text"
                                placeholder="Filter logs..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 pl-8 pr-8 text-xs bg-[var(--muted)]/20"
                            />
                            {searchQuery && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                            )}
                        </div>

                        <div className="flex items-center gap-1">
                            {['INFO', 'WARNING', 'ERROR'].map((sev) => (
                                <Button
                                    key={sev}
                                    variant="ghost"
                                    onClick={() => toggleSeverityFilter(sev)}
                                    className={cn(
                                        "h-7 px-2 py-0 text-[10px] font-bold border transition-all",
                                        severityFilter.has(sev)
                                            ? sev === 'ERROR' ? 'bg-[var(--error-bg)] text-[var(--error)] border-[var(--error)]/30 hover:bg-[var(--error-bg)]/80'
                                            : sev === 'WARNING' ? 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/30 hover:bg-[var(--warning-bg)]/80'
                                            : 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info)]/30 hover:bg-[var(--info-bg)]/80'
                                            : 'bg-[var(--muted)]/10 text-[var(--muted-foreground)] border-transparent hover:bg-[var(--muted)]/20'
                                    )}
                                >
                                    {sev}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={copyLogs}
                            disabled={logs.length === 0}
                            className="h-8 w-8 text-[var(--muted-foreground)]"
                            title="Copy filtered logs"
                        >
                            {isCopying ? <Check className="w-4 h-4 text-[var(--success)]" /> : <Copy className="w-4 h-4" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsPaused(!isPaused)}
                            className={cn(
                                "h-8 w-8",
                                isPaused
                                    ? 'bg-[var(--warning-bg)] text-[var(--warning)] hover:bg-[var(--warning-bg)]'
                                    : 'text-[var(--muted-foreground)]'
                            )}
                            title={isPaused ? "Resume auto-scroll" : "Pause auto-scroll"}
                        >
                            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={clearLogs}
                            className="h-8 w-8 text-[var(--muted-foreground)]"
                            title="Clear logs"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-[var(--error-bg)] text-[var(--error)] px-4 py-2 text-xs border-b border-[var(--error)]/20 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Error: {error}
                </div>
            )}

            {/* Logs Area */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 h-[400px] overflow-y-auto p-4 bg-[var(--terminal-bg)] text-[var(--terminal-foreground)] font-mono text-[12px] leading-relaxed relative"
            >
                {logs.length === 0 && isLoading ? (
                    <div className="space-y-2 p-2">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex gap-4">
                                <Skeleton className="h-4 w-24 bg-[var(--terminal-foreground)]/5" />
                                <Skeleton className="h-4 w-12 bg-[var(--terminal-foreground)]/5" />
                                <Skeleton className="h-4 w-full bg-[var(--terminal-foreground)]/5" />
                            </div>
                        ))}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] gap-2">
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
                    <div className="flex flex-col">
                        {filteredLogs.map((log, index) => (
                            <div key={log.insertId || index} className="flex items-start gap-3 hover:bg-[var(--terminal-foreground)]/5 px-1 py-0.5 rounded -mx-1 group transition-colors">
                                <span className="text-[var(--muted)] shrink-0 select-none w-[100px] opacity-70 group-hover:opacity-100 transition-opacity">
                                    {formatTimestamp(log.timestamp)}
                                </span>
                                <span className={`font-bold shrink-0 w-[70px] select-none ${getSeverityColor(log.severity)}`}>
                                    {log.severity}
                                </span>
                                <span className="text-[var(--muted)] break-all whitespace-pre-wrap flex-1">
                                    {log.textPayload || (log.jsonPayload ? JSON.stringify(log.jsonPayload) : '')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                <div ref={logsEndRef} />

                {/* Scroll to bottom button */}
                {!shouldAutoScroll && logs.length > 0 && (
                    <Button
                        size="icon"
                        onClick={() => {
                            setShouldAutoScroll(true);
                            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="absolute bottom-4 right-4 rounded-full shadow-lg z-10"
                    >
                        <ArrowDown className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
