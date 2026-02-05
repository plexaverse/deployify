'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { Project } from '@/types';

interface ResourceSettingsProps {
    projectId: string;
    initialResources?: {
        cpu?: number;
        memory?: string;
        minInstances?: number;
        maxInstances?: number;
    };
    onUpdate?: () => void;
}

const CPU_OPTIONS = [1, 2, 4, 8];
const MEMORY_OPTIONS = ['512Mi', '1Gi', '2Gi', '4Gi', '8Gi', '16Gi', '32Gi'];

export function ResourceSettings({ projectId, initialResources, onUpdate }: ResourceSettingsProps) {
    const [cpu, setCpu] = useState(initialResources?.cpu || 1);
    const [memory, setMemory] = useState(initialResources?.memory || '512Mi');
    const [minInstances, setMinInstances] = useState(initialResources?.minInstances || 0);
    const [maxInstances, setMaxInstances] = useState(initialResources?.maxInstances || 10);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        // Client-side validation
        if (maxInstances <= 0) {
            toast.error('Max instances must be greater than 0');
            return;
        }

        if (maxInstances < minInstances) {
            toast.error('Max instances cannot be less than min instances');
            return;
        }

        if (minInstances < 0) {
            toast.error('Min instances must be 0 or greater');
            return;
        }

        setSaving(true);
        const toastId = toast.loading('Saving resource settings...');

        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resources: {
                        cpu,
                        memory,
                        minInstances,
                        maxInstances,
                    },
                }),
            });

            if (response.ok) {
                toast.success('Resource settings saved', { id: toastId });
                onUpdate?.();
            } else {
                const data = await response.json();
                toast.error(data.error || 'Failed to save settings', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error('Failed to save settings', { id: toastId });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="card mt-8">
            <h2 className="text-lg font-semibold mb-4">Resource Settings</h2>
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="cpu" className="block text-sm font-medium mb-1">CPU</label>
                        <select
                            id="cpu"
                            value={cpu}
                            onChange={(e) => setCpu(Number(e.target.value))}
                            className="input w-full"
                        >
                            {CPU_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option} vCPU
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Allocated CPU for each instance
                        </p>
                    </div>
                    <div>
                        <label htmlFor="memory" className="block text-sm font-medium mb-1">Memory</label>
                        <select
                            id="memory"
                            value={memory}
                            onChange={(e) => setMemory(e.target.value)}
                            className="input w-full"
                        >
                            {MEMORY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Allocated Memory for each instance
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="min-instances" className="block text-sm font-medium mb-1">Min Instances</label>
                        <input
                            id="min-instances"
                            type="number"
                            min="0"
                            value={minInstances}
                            onChange={(e) => setMinInstances(parseInt(e.target.value) || 0)}
                            className="input w-full"
                        />
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Minimum number of instances to keep running (0 = scales to zero)
                        </p>
                    </div>
                    <div>
                        <label htmlFor="max-instances" className="block text-sm font-medium mb-1">Max Instances</label>
                        <input
                            id="max-instances"
                            type="number"
                            min="1"
                            value={maxInstances}
                            onChange={(e) => setMaxInstances(parseInt(e.target.value) || 1)}
                            className="input w-full"
                        />
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Maximum number of instances to scale up to
                        </p>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn btn-primary"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
