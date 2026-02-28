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
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Terminal className="w-8 h-8 text-[var(--primary)]" />
                    Logs
                </h1>
                <p className="text-[var(--muted-foreground)] text-lg">
                    Search and filter your project logs.
                </p>
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
