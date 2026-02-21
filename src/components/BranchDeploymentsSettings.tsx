'use client';

import { useState } from 'react';
import { Plus, Trash2, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { EmptyState } from '@/components/EmptyState';

interface BranchEnvironments {
    branch: string;
    envTarget: 'production' | 'preview';
}

interface BranchDeploymentsSettingsProps {
    projectId: string;
    onUpdate?: () => void;
}

export function BranchDeploymentsSettings({
    projectId,
    onUpdate,
}: BranchDeploymentsSettingsProps) {
    const { currentProject, updateBranchSettings: updateStoreBranchSettings } = useStore();
    const branches = currentProject?.autodeployBranches || [];
    const branchEnvironments = (currentProject?.branchEnvironments as unknown as BranchEnvironments[]) || [];

    const [newBranch, setNewBranch] = useState('');
    const [loading, setLoading] = useState(false);

    // Helper to call store action
    const updateBranches = async (updatedBranches: string[], updatedEnvironments: BranchEnvironments[]) => {
        setLoading(true);
        try {
            const success = await updateStoreBranchSettings(projectId, {
                autodeployBranches: updatedBranches,
                branchEnvironments: updatedEnvironments,
            });

            if (success) {
                toast.success('Branch settings updated');
                if (onUpdate) onUpdate();
            } else {
                toast.error('Failed to update branch settings');
            }
        } catch (error) {
            console.error('Failed to update branches:', error);
            toast.error('Failed to update branch settings');
        } finally {
            setLoading(false);
        }
    };

    const handleAddBranch = async () => {
        if (!newBranch.trim()) return;

        const branchToAdd = newBranch.trim();

        if (branches.includes(branchToAdd)) {
            toast.error('Branch already added');
            return;
        }

        const updatedBranches = [...branches, branchToAdd];
        // Default new branch to preview, unless it already exists in mapping
        const updatedEnvironments = [...branchEnvironments];
        if (!updatedEnvironments.find((be: BranchEnvironments) => be.branch === branchToAdd)) {
            updatedEnvironments.push({ branch: branchToAdd, envTarget: 'preview' });
        }

        await updateBranches(updatedBranches, updatedEnvironments);
        setNewBranch('');
    };

    const handleRemoveBranch = async (branchToRemove: string) => {
        const updatedBranches = branches.filter((b: string) => b !== branchToRemove);
        const updatedEnvironments = branchEnvironments.filter((be: BranchEnvironments) => be.branch !== branchToRemove);
        await updateBranches(updatedBranches, updatedEnvironments);
    };

    const handleEnvironmentChange = async (branch: string, envTarget: string) => {
        const target = envTarget as 'production' | 'preview';
        const updatedEnvironments = branchEnvironments.map((be: BranchEnvironments) =>
            be.branch === branch ? { ...be, envTarget: target } : be
        );

        if (!updatedEnvironments.find((be: BranchEnvironments) => be.branch === branch)) {
            updatedEnvironments.push({ branch, envTarget: target });
        }

        await updateBranches(branches, updatedEnvironments);
    };

    const getEnvTarget = (branch: string) => {
        const env = branchEnvironments.find((be: BranchEnvironments) => be.branch === branch);
        return env?.envTarget || 'preview';
    };

    return (
        <Card>
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <GitBranch className="w-5 h-5 text-[var(--primary)]" />
                    <h2 className="text-xl font-semibold">Branch Deployments</h2>
                </div>
                <div className="text-sm text-[var(--muted-foreground)]">
                    <p>Configure which branches should trigger automatic deployments.</p>
                    <p className="mt-1">
                        The default branch is always deployed to Production.
                        Other branches listed here will be deployed to a persistent branch environment (e.g., <code className="bg-[var(--muted)]/50 px-1 py-0.5 rounded text-xs">dfy-project-branchname</code>).
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                <div className="flex gap-2">
                    <Input
                        type="text"
                        value={newBranch}
                        onChange={(e) => setNewBranch(e.target.value)}
                        placeholder="e.g., staging, develop"
                        className="flex-1"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddBranch();
                            }
                        }}
                    />
                    <Button
                        onClick={handleAddBranch}
                        disabled={loading || !newBranch.trim()}
                        loading={loading}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Branch
                    </Button>
                </div>

                {branches.length === 0 ? (
                    <EmptyState
                        title="No additional branches"
                        description="Only the default branch will be automatically deployed to Production. Add branches like staging or develop to enable preview environments."
                        icon={GitBranch}
                    />
                ) : (
                    <div className="border border-[var(--border)] rounded-md overflow-hidden divide-y divide-[var(--border)]">
                        {branches.map((branch: string) => (
                            <div key={branch} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[var(--background)] gap-4">
                                <div className="flex items-center gap-2">
                                    <GitBranch className="w-4 h-4 text-[var(--muted-foreground)]" />
                                    <span className="font-medium font-mono text-sm">{branch}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <NativeSelect
                                        value={getEnvTarget(branch)}
                                        onChange={(e) => handleEnvironmentChange(branch, e.target.value)}
                                        disabled={loading}
                                        className="h-9 min-w-[140px]"
                                    >
                                        <option value="preview">Preview Env</option>
                                        <option value="production">Production Env</option>
                                    </NativeSelect>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveBranch(branch)}
                                        disabled={loading}
                                        className="text-[var(--muted-foreground)] hover:text-[var(--error)] hover:bg-[var(--error-bg)]"
                                        title="Remove branch"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
}
