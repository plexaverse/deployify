'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Loader2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

interface LogViewerProps {
    logs: string | null;
    loading?: boolean;
    error?: string | null;
    onRetry?: () => void;
}

type Severity = 'ALL' | 'INFO' | 'WARNING' | 'ERROR';

export function LogViewer({ logs, loading, error, onRetry }: LogViewerProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [severity, setSeverity] = useState<Severity>('ALL');
    const logsEndRef = useRef<HTMLDivElement>(null);

    const filteredLogs = useMemo(() => {
        if (!logs) return [];
        const lines = logs.split('\n');
        return lines.filter(line => {
            const lowerLine = line.toLowerCase();

            // Search filter
            if (searchQuery && !lowerLine.includes(searchQuery.toLowerCase())) {
                return false;
            }

            // Severity filter
            if (severity === 'ALL') return true;

            if (severity === 'ERROR') {
                return lowerLine.includes('error') || lowerLine.includes('fail') || lowerLine.includes('exception');
            }
            if (severity === 'WARNING') {
                return lowerLine.includes('warn');
            }
            if (severity === 'INFO') {
                return !lowerLine.includes('error') && !lowerLine.includes('fail') && !lowerLine.includes('exception') && !lowerLine.includes('warn');
            }
            return true;
        });
    }, [logs, searchQuery, severity]);

    // Auto-scroll to bottom when filtered logs change or loading finishes
    useEffect(() => {
        if (logsEndRef.current && !loading) {
             logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [filteredLogs.length, loading, severity]);

    return (
        <div className="flex flex-col h-full bg-[#0d1117] text-gray-300 font-mono text-xs md:text-sm overflow-hidden rounded-b-xl">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-2 p-2 border-b border-gray-800 bg-[#161b22]">
                <div className="relative flex-1 w-full md:w-auto">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#0d1117] border border-gray-700 rounded-md py-1.5 pl-8 pr-8 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                    {(['ALL', 'INFO', 'WARNING', 'ERROR'] as Severity[]).map((level) => (
                        <button
                            key={level}
                            onClick={() => setSeverity(level)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                                severity === level
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                            }`}
                        >
                            {level === 'ERROR' && <AlertCircle className="w-3 h-3" />}
                            {level === 'WARNING' && <AlertTriangle className="w-3 h-3" />}
                            {level === 'INFO' && <Info className="w-3 h-3" />}
                            {level}
                        </button>
                    ))}
                </div>
            </div>

            {/* Logs Area */}
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                {loading && !logs ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin mb-4" />
                        <p>Fetching build logs...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-400">
                        <AlertCircle className="w-8 h-8 mb-2" />
                        <p>{error}</p>
                        {onRetry && (
                            <button onClick={onRetry} className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white transition-colors">
                                Retry
                            </button>
                        )}
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500 italic">
                        {logs ? 'No logs match your filter.' : 'No logs available.'}
                    </div>
                ) : (
                    <>
                        <div className="space-y-0.5">
                            {filteredLogs.map((line, i) => (
                                <div key={i} className="hover:bg-white/5 px-1 -mx-1 rounded whitespace-pre-wrap break-all">
                                    {highlightSearchTerm(line, searchQuery)}
                                </div>
                            ))}
                        </div>
                        <div ref={logsEndRef} />
                    </>
                )}
            </div>
        </div>
    );
}

// Helper to highlight search matches
function highlightSearchTerm(text: string, term: string) {
    if (!term) return text;

    // Escape special characters in term for RegExp
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escapedTerm})`, 'gi'));

    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === term.toLowerCase() ? (
                    <span key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">{part}</span>
                ) : (
                    part
                )
            )}
        </span>
    );
}
