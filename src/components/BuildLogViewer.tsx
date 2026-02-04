'use client';

import { useEffect, useRef } from 'react';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';

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
            <div className="flex items-center justify-center h-full text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Loading build logs...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-red-400">{error}</p>
                <button
                    onClick={onRetry}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 transition-opacity"
                >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                </button>
            </div>
        );
    }

    if (!logs) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                <p>No build logs available yet</p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="h-full overflow-y-auto p-4 font-mono text-xs leading-relaxed"
        >
            <pre className="whitespace-pre-wrap text-gray-300">{logs}</pre>
        </div>
    );
}
