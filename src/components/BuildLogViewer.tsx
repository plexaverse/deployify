'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
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
            <div className={cn("flex flex-col gap-2 p-4 h-full bg-[var(--terminal-bg)] overflow-hidden", className)}>
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex gap-4">
                        <Skeleton className="h-4 w-24 bg-[var(--terminal-header-bg)]" />
                        <Skeleton className="h-4 w-full bg-[var(--terminal-header-bg)]" />
                    </div>
                ))}
            </div>
        );
    }

    if (!logs && !loading && !error) {
        return (
            <div className={cn("flex items-center justify-center h-full text-[var(--muted-foreground)] bg-[var(--terminal-bg)]", className)}>
                <p>No build logs available yet</p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={cn("h-full overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-[var(--terminal-bg)]", className)}
        >
            <div className="flex flex-col space-y-0.5 text-[var(--terminal-foreground)]/90">
                {logs?.split('\n').map((line, i) => (
                    <div key={i} className="break-all whitespace-pre-wrap hover:bg-[var(--terminal-foreground)]/5 transition-colors duration-200 px-1 rounded -mx-1 group">
                        {line || '\u00A0'}
                    </div>
                ))}
            </div>

            {error && (
                <div className="flex flex-col items-start mt-4 pt-4 border-t border-[var(--terminal-border)] gap-2">
                    <div className="flex items-center gap-2 text-[var(--error)] font-medium">
                        <AlertCircle className="w-4 h-4" />
                        <span>Build Failed</span>
                    </div>
                    <p className="text-[var(--error)]/90 break-all whitespace-pre-wrap">{error}</p>
                    {onRetry && (
                        <Button
                            onClick={onRetry}
                            variant="secondary"
                            size="sm"
                            className="mt-2"
                        >
                            <RefreshCw className="w-3.5 h-3.5 mr-2" />
                            Retry Build
                        </Button>
                    )}
                </div>
            )}

            <div ref={logsEndRef} />
        </div>
    );
}
