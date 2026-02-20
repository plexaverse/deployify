'use client';

import { useState } from 'react';
import {
    Plus,
    Trash2,
    Clock,
    AlertCircle,
    Info,
} from 'lucide-react';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { EmptyState } from '@/components/EmptyState';
import { CronJobConfig } from '@/types';
import { toast } from 'sonner';

interface CronsSectionProps {
    projectId: string;
    onUpdate?: () => void;
}

const PREDEFINED_SCHEDULES = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every 5 minutes', value: '*/5 * * * *' },
    { label: 'Every 15 minutes', value: '*/15 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every day (Midnight UTC)', value: '0 0 * * *' },
    { label: 'Custom', value: 'custom' },
];

export function CronsSection({ projectId, onUpdate }: CronsSectionProps) {
    const {
        currentProject: project,
        updateProjectCrons,
    } = useStore();

    const [isAdding, setIsAdding] = useState(false);
    const [newPath, setNewPath] = useState('');
    const [scheduleType, setScheduleType] = useState(PREDEFINED_SCHEDULES[3].value);
    const [customSchedule, setCustomSchedule] = useState('0 0 * * *');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const crons = project?.crons || [];

    const handleAdd = async () => {
        if (!newPath.trim()) {
            setError('Path is required');
            return;
        }

        const schedule = scheduleType === 'custom' ? customSchedule : scheduleType;

        if (!schedule.trim()) {
            setError('Schedule is required');
            return;
        }

        setError(null);
        setIsSubmitting(true);

        try {
            const newCron: CronJobConfig = {
                path: newPath.startsWith('/') ? newPath : `/${newPath}`,
                schedule: schedule.trim(),
            };

            const updatedCrons = [...crons, newCron];
            const success = await updateProjectCrons(projectId, updatedCrons);

            if (success) {
                setNewPath('');
                setIsAdding(false);
                toast.success('Cron job added');
                if (onUpdate) onUpdate();
            } else {
                toast.error('Failed to add cron job');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (index: number) => {
        if (!confirm('Are you sure you want to delete this cron job?')) return;

        const updatedCrons = crons.filter((_, i) => i !== index);
        const success = await updateProjectCrons(projectId, updatedCrons);

        if (success) {
            toast.success('Cron job deleted');
            if (onUpdate) onUpdate();
        } else {
            toast.error('Failed to delete cron job');
        }
    };

    return (
        <Card>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-[var(--primary)]" />
                        Cron Jobs
                    </h2>
                    <p className="text-sm text-[var(--muted-foreground)]">
                        Schedule recurring tasks to call your API endpoints.
                    </p>
                </div>
                <Button
                    onClick={() => setIsAdding(!isAdding)}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Cron Job
                </Button>
            </div>

            {error && (
                <div className="mb-6 p-3 bg-[var(--error-bg)] border border-[var(--error)]/50 rounded-md flex items-center gap-3 text-[var(--error)] text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {isAdding && (
                <div className="mb-8 p-4 border border-[var(--border)] rounded-md bg-[var(--background)] animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2">
                            <Label>Path</Label>
                            <Input
                                type="text"
                                value={newPath}
                                onChange={(e) => setNewPath(e.target.value)}
                                placeholder="/api/cron/daily-report"
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-[var(--muted-foreground)]">
                                Relative path to call (GET request).
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Schedule</Label>
                            <NativeSelect
                                value={scheduleType}
                                onChange={(e) => setScheduleType(e.target.value)}
                            >
                                {PREDEFINED_SCHEDULES.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </NativeSelect>
                        </div>
                        {scheduleType === 'custom' && (
                            <div className="space-y-2 md:col-span-2">
                                <Label>Custom Expression (UTC)</Label>
                                <Input
                                    type="text"
                                    value={customSchedule}
                                    onChange={(e) => setCustomSchedule(e.target.value)}
                                    placeholder="0 0 * * *"
                                    className="font-mono text-sm"
                                />
                                <p className="text-xs text-[var(--muted-foreground)]">
                                    Standard cron format: minute hour day(month) month day(week)
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setIsAdding(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAdd}
                            disabled={isSubmitting}
                            loading={isSubmitting}
                        >
                            Add Cron Job
                        </Button>
                    </div>
                </div>
            )}

            {crons.length === 0 ? (
                <EmptyState
                    title="No cron jobs configured"
                    description="Create scheduled tasks to automatically trigger your API routes at specific times."
                    icon={Clock}
                />
            ) : (
                <div className="space-y-4">
                    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/20">
                                    <th className="py-3 px-4 font-semibold text-sm w-[40%]">Path</th>
                                    <th className="py-3 px-4 font-semibold text-sm w-[40%]">Schedule</th>
                                    <th className="py-3 px-4 font-semibold text-sm text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {crons.map((cron, index) => (
                                    <tr key={index} className="border-b border-[var(--border)] hover:bg-[var(--muted)]/10 transition-colors last:border-0">
                                        <td className="py-3 px-4 text-sm font-mono">
                                            {cron.path}
                                        </td>
                                        <td className="py-3 px-4 text-sm font-mono">
                                            {cron.schedule}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(index)}
                                                className="text-[var(--muted-foreground)] hover:text-[var(--error)] hover:bg-[var(--error-bg)] h-8 w-8 p-0"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="mt-6 flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-md">
                <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                    <p className="font-medium text-blue-400 mb-1 text-sm">How it works</p>
                    <p className="text-[var(--muted-foreground)] leading-relaxed">
                        Deployify uses Google Cloud Scheduler to trigger your application&apos;s endpoints via HTTP GET requests.
                        Ensure your application is deployed and the endpoints are accessible.
                        Requests will originate from Google Cloud Scheduler.
                    </p>
                </div>
            </div>
        </Card>
    );
}
