'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BuildLogViewerProps {
    logs: string | null;
    loading: boolean;
    error: string | null;
    onRetry?: () => void;
    className?: string;
}

export function BuildLogViewer({ logs, loading, error, onRetry, className }: BuildLogViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when logs change
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, error, loading]);

    if (loading && !logs) {
        return (
            <div className={cn("flex flex-col gap-2 p-6 h-full bg-[var(--terminal-bg)] overflow-hidden", className)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="flex gap-4 items-center">
                        <Skeleton className="h-3 w-28 bg-[var(--terminal-header-bg)] rounded-sm" />
                        <Skeleton className="h-3 w-full bg-[var(--terminal-header-bg)] rounded-sm" />
                    </div>
                ))}
            </div>
        );
    }

    if (!logs && !loading && !error) {
        return (
            <div className={cn("flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] bg-[var(--terminal-bg)] p-8 gap-4", className)}>
                <div className="w-12 h-12 rounded-2xl bg-[var(--muted)]/10 flex items-center justify-center opacity-50">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                </div>
                <div className="space-y-1 text-center">
                   <p className="text-[10px] font-bold uppercase tracking-wider">Initialization</p>
                   <p className="text-xs font-semibold">Waiting for build logs...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={cn("h-full overflow-y-auto p-6 font-mono text-[10px] leading-relaxed bg-[var(--terminal-bg)] selection:bg-[var(--primary)]/30", className)}
        >
            <div className="flex flex-col space-y-0.5 text-[var(--terminal-foreground)]/80">
                {logs?.split('\n').map((line, i) => (
                    <div key={i} className="break-all whitespace-pre-wrap hover:bg-[var(--terminal-foreground)]/5 transition-colors duration-200 px-2 rounded-sm -mx-2 group flex gap-4">
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider opacity-30 select-none w-10 text-right">
                           {(i + 1).toString().padStart(3, '0')}
                        </span>
                        <span className="flex-1">{line || '\u00A0'}</span>
                    </div>
                ))}
            </div>

            {logs && !error && !loading && (
                <div className="flex items-center gap-2 mt-8 py-3 px-4 rounded-lg bg-[var(--success)]/5 border border-[var(--success)]/10 text-[var(--success)]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Build process completed successfully</span>
                </div>
            )}

            {error && (
                <div className="flex flex-col items-start mt-8 p-6 rounded-xl bg-[var(--error)]/5 border border-[var(--error)]/10 gap-4">
                    <div className="flex items-center gap-2 text-[var(--error)]">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Deployment Pipeline Error</span>
                    </div>
                    <p className="text-xs font-semibold text-[var(--error)]/90 break-all whitespace-pre-wrap">{error}</p>
                    {onRetry && (
                        <Button
                            onClick={onRetry}
                            variant="secondary"
                            size="sm"
                            className="text-[10px] font-bold uppercase tracking-wider h-8 px-4"
                        >
                            <RefreshCw className="w-3.5 h-3.5 mr-2" />
                            Retry Deployment
                        </Button>
                    )}
                </div>
            )}

            <div ref={logsEndRef} className="h-8" />
        </div>
    );
}
