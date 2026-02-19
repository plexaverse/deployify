'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

interface ResourceSettingsProps {
    projectId: string;
    onUpdate?: () => void;
}

const CPU_OPTIONS = [1, 2, 4];
const MEMORY_OPTIONS = ['256Mi', '512Mi', '1Gi', '2Gi', '4Gi'];

export function ResourceSettings({ projectId, onUpdate }: ResourceSettingsProps) {
    const { currentProject, updateProjectResources } = useStore();
    const initialResources = currentProject?.resources;

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
            const success = await updateProjectResources(projectId, {
                cpu,
                memory,
                minInstances,
                maxInstances,
            });

            if (success) {
                toast.success('Resource settings saved', { id: toastId });
                if (onUpdate) onUpdate();
            } else {
                toast.error('Failed to save settings', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error('Failed to save settings', { id: toastId });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <div className="mb-6">
                <h2 className="text-xl font-semibold mb-1">Resource Settings</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                    Configure CPU, memory, and scaling limits for your application.
                </p>
            </div>

            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="cpu">CPU</Label>
                        <NativeSelect
                            id="cpu"
                            value={cpu}
                            onChange={(e) => setCpu(Number(e.target.value))}
                        >
                            {CPU_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option} vCPU
                                </option>
                            ))}
                        </NativeSelect>
                        <p className="text-xs text-[var(--muted-foreground)]">
                            Allocated CPU for each instance
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="memory">Memory</Label>
                        <NativeSelect
                            id="memory"
                            value={memory}
                            onChange={(e) => setMemory(e.target.value)}
                        >
                            {MEMORY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </NativeSelect>
                        <p className="text-xs text-[var(--muted-foreground)]">
                            Allocated Memory for each instance
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="min-instances">Min Instances</Label>
                        <Input
                            id="min-instances"
                            type="number"
                            min="0"
                            value={minInstances}
                            onChange={(e) => setMinInstances(parseInt(e.target.value) || 0)}
                        />
                        <p className="text-xs text-[var(--muted-foreground)]">
                            Minimum number of instances to keep running (0 = scales to zero)
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="max-instances">Max Instances</Label>
                        <Input
                            id="max-instances"
                            type="number"
                            min="1"
                            value={maxInstances}
                            onChange={(e) => setMaxInstances(parseInt(e.target.value) || 1)}
                        />
                        <p className="text-xs text-[var(--muted-foreground)]">
                            Maximum number of instances to scale up to
                        </p>
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                    <Button
                        onClick={handleSave}
                        loading={saving}
                    >
                        Save Changes
                    </Button>
                </div>
            </div>
        </Card>
    );
}
