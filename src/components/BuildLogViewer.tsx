'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface BuildLogViewerProps {
    logs: string | null;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
}

export function BuildLogViewer({ logs, loading, error, onRetry }: BuildLogViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when logs change
    useEffect(() => {
        if (containerRef.current && logs) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [logs]);

    if (loading) {
        return (
            <div className="flex flex-col gap-2 p-4 h-full bg-[var(--terminal-bg)]">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex gap-4">
                        <Skeleton className="h-4 w-24 bg-[var(--terminal-header-bg)]" />
                        <Skeleton className="h-4 w-full bg-[var(--terminal-header-bg)]" />
                    </div>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] gap-4 bg-[var(--terminal-bg)]">
                <AlertCircle className="w-8 h-8 text-[var(--error)]" />
                <p className="text-[var(--error)]">{error}</p>
                <Button
                    onClick={onRetry}
                    variant="primary"
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                </Button>
            </div>
        );
    }

    if (!logs) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] bg-[var(--terminal-bg)]">
                <p>No build logs available yet</p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="h-full overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-[var(--terminal-bg)]"
        >
            <pre className="whitespace-pre-wrap text-[var(--terminal-foreground)]/90">{logs}</pre>
        </div>
    );
}
