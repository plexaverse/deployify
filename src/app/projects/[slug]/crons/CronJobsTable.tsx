'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface CronJob {
    name: string;
    schedule: string;
    timeZone: string;
    path: string;
    lastRunStatus: 'success' | 'failure' | 'unknown';
    lastRunTime?: string;
    nextRunTime?: string;
    state: string;
}

export function CronJobsTable({ projectId }: { projectId: string }) {
    const [jobs, setJobs] = useState<CronJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchJobs() {
            try {
                const res = await fetch(`/api/projects/${projectId}/crons`);
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to fetch cron jobs');
                }
                const data = await res.json();
                setJobs(data.jobs);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        }
        fetchJobs();
    }, [projectId]);

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[var(--foreground)]" /></div>;
    if (error) return <div className="p-4 text-red-500 bg-red-50/10 rounded flex gap-2 items-center border border-red-500/20"><AlertCircle className="w-4 h-4"/> {error}</div>;

    if (jobs.length === 0) {
        return <div className="text-center p-8 text-[var(--muted-foreground)]">No cron jobs found for this project.</div>;
    }

    return (
        <div className="w-full overflow-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-[var(--muted-foreground)] uppercase bg-[var(--secondary)/50] border-b border-[var(--border)]">
                    <tr>
                        <th className="px-4 py-3">Schedule</th>
                        <th className="px-4 py-3">Path</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Last Run</th>
                        <th className="px-4 py-3">Next Run</th>
                    </tr>
                </thead>
                <tbody>
                    {jobs.map((job) => (
                        <tr key={job.name} className="bg-[var(--background)] border-b border-[var(--border)] hover:bg-[var(--secondary)/20] transition-colors">
                            <td className="px-4 py-3 font-mono">{job.schedule}</td>
                            <td className="px-4 py-3 font-mono text-xs">{job.path}</td>
                            <td className="px-4 py-3">
                                {job.lastRunStatus === 'success' && <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> Success</span>}
                                {job.lastRunStatus === 'failure' && <span className="text-red-500 flex items-center gap-1"><XCircle className="w-4 h-4"/> Failed</span>}
                                {job.lastRunStatus === 'unknown' && <span className="text-[var(--muted-foreground)] flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Unknown</span>}
                            </td>
                            <td className="px-4 py-3 text-[var(--foreground)]">
                                {job.lastRunTime ? new Date(job.lastRunTime).toLocaleString() : '-'}
                            </td>
                            <td className="px-4 py-3">
                                {job.nextRunTime ? <span className="flex items-center gap-1 text-blue-500"><Clock className="w-3 h-3"/> {new Date(job.nextRunTime).toLocaleString()}</span> : '-'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
