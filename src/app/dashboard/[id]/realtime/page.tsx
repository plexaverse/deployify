'use client';

import { useParams } from 'next/navigation';
import { LogViewer } from '@/components/LogViewer';

export default function RealtimeLogsPage() {
    const params = useParams();
    const id = params.id as string;

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold tracking-tight">Realtime Logs</h1>
                <p className="text-[var(--muted-foreground)] text-sm">
                    View live logs from your production environment.
                </p>
            </div>

            <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)] shadow-sm">
                <LogViewer projectId={id} key={id} />
            </div>
        </div>
    );
}
