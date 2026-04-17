'use client';

import { useParams } from 'next/navigation';
import { Terminal } from 'lucide-react';
import { LogViewer } from '@/components/LogViewer';
import { Card } from '@/components/ui/card';

export default function LogsDashboardPage() {
    const params = useParams();
    const id = params.id as string;

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Terminal className="w-8 h-8 text-[var(--primary)]" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Runtime Output</span>
                        <h1 className="text-[9px] md:text-[11px] font-bold tracking-tight">Logs</h1>
                    </div>
                </div>
            </div>

            <Card className="overflow-hidden p-0 shadow-sm">
                <LogViewer
                    projectId={id}
                    key={id}
                    className="border-0 shadow-none rounded-none"
                />
            </Card>
        </div>
    );
}
