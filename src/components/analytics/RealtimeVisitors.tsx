'use client';

import { useState, useEffect } from 'react';
import { Users, Activity } from 'lucide-react';

interface RealtimeVisitorsProps {
    projectId: string;
}

export function RealtimeVisitors({ projectId }: RealtimeVisitorsProps) {
    const [stats, setStats] = useState<{ visitors: number; pageviews: number }>({ visitors: 0, pageviews: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRealtime = async () => {
            try {
                const res = await fetch(`/api/v1/analytics/${projectId}/realtime`);
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
                }
            } catch (err) {
                console.error('Failed to fetch realtime stats:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchRealtime();
        const interval = setInterval(fetchRealtime, 30000); // 30s polling

        return () => clearInterval(interval);
    }, [projectId]);

    return (
        <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] shadow-sm">
            <div className="flex items-center gap-2">
                <div className="relative">
                    <Users className="w-4 h-4 text-[var(--primary)]" />
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                </div>
                <span className="text-sm font-semibold whitespace-nowrap">
                    {loading ? '...' : stats.visitors} Live Visitors
                </span>
            </div>

            <div className="h-4 w-[1px] bg-[var(--border)]" />

            <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--info)]" />
                <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                    {stats.pageviews} views in last 15m
                </span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Live</span>
            </div>
        </div>
    );
}
