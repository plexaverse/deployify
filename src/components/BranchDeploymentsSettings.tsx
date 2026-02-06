'use client';

import { useState } from 'react';
import { Plus, Trash2, Loader2, GitBranch } from 'lucide-react';
import { toast } from 'sonner';

interface BranchEnvironments {
    branch: string;
    envTarget: 'production' | 'preview';
}

interface BranchDeploymentsSettingsProps {
    projectId: string;
    initialBranches: string[];
    initialBranchEnvironments?: BranchEnvironments[];
    onUpdate?: () => void;
}

export function BranchDeploymentsSettings({
    projectId,
    initialBranches = [],
    initialBranchEnvironments = [],
    onUpdate,
}: BranchDeploymentsSettingsProps) {
    const [branches, setBranches] = useState<string[]>(initialBranches);
    const [branchEnvironments, setBranchEnvironments] = useState<BranchEnvironments[]>(initialBranchEnvironments);
    const [newBranch, setNewBranch] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAddBranch = async () => {
        if (!newBranch.trim()) return;

        const branchToAdd = newBranch.trim();

        if (branches.includes(branchToAdd)) {
            toast.error('Branch already added');
            return;
        }

        const updatedBranches = [...branches, branchToAdd];
        // Default new branch to preview, unless it already exists in mapping
        let updatedEnvironments = [...branchEnvironments];
        if (!updatedEnvironments.find(be => be.branch === branchToAdd)) {
            updatedEnvironments.push({ branch: branchToAdd, envTarget: 'preview' });
        }

        await updateBranches(updatedBranches, updatedEnvironments);
        setNewBranch('');
    };

    const handleRemoveBranch = async (branchToRemove: string) => {
        const updatedBranches = branches.filter(b => b !== branchToRemove);
        const updatedEnvironments = branchEnvironments.filter(be => be.branch !== branchToRemove);
        await updateBranches(updatedBranches, updatedEnvironments);
    };

    const handleEnvironmentChange = async (branch: string, envTarget: 'production' | 'preview') => {
        let updatedEnvironments = branchEnvironments.map(be =>
            be.branch === branch ? { ...be, envTarget } : be
        );

        if (!updatedEnvironments.find(be => be.branch === branch)) {
             updatedEnvironments.push({ branch, envTarget });
        }

        await updateBranches(branches, updatedEnvironments);
    };

    const updateBranches = async (updatedBranches: string[], updatedEnvironments: BranchEnvironments[]) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    autodeployBranches: updatedBranches,
                    branchEnvironments: updatedEnvironments,
                }),
            });

            if (response.ok) {
                setBranches(updatedBranches);
                setBranchEnvironments(updatedEnvironments);
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

    const getEnvTarget = (branch: string) => {
        return branchEnvironments.find(be => be.branch === branch)?.envTarget || 'preview';
    };

    return (
        <div className="card mt-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <GitBranch className="w-5 h-5" />
                Branch Deployments
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Configure which branches should trigger automatic deployments.
                The default branch is always deployed to Production.
                Other branches listed here will be deployed to a persistent branch environment (e.g., <code>dfy-project-branchname</code>).
            </p>

            <div className="space-y-4">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newBranch}
                        onChange={(e) => setNewBranch(e.target.value)}
                        placeholder="e.g., staging, develop"
                        className="input flex-1"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddBranch();
                            }
                        }}
                    />
                    <button
                        onClick={handleAddBranch}
                        disabled={loading || !newBranch.trim()}
                        className="btn btn-primary"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        <span className="ml-2 hidden sm:inline">Add Branch</span>
                    </button>
                </div>

                {branches.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-[var(--border)] rounded-lg text-[var(--muted-foreground)]">
                        No additional branches configured. Only the default branch will be deployed (to Production).
                    </div>
                ) : (
                    <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
                        {branches.map((branch) => (
                            <div key={branch} className="flex items-center justify-between p-3 bg-[var(--background)]">
                                <div className="flex items-center gap-2">
                                    <GitBranch className="w-4 h-4 text-[var(--muted-foreground)]" />
                                    <span className="font-medium">{branch}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <select
                                        value={getEnvTarget(branch)}
                                        onChange={(e) => handleEnvironmentChange(branch, e.target.value as 'production' | 'preview')}
                                        disabled={loading}
                                        className="text-sm border border-[var(--border)] bg-[var(--card)] rounded px-2 py-1"
                                    >
                                        <option value="preview">Preview Env</option>
                                        <option value="production">Production Env</option>
                                    </select>
                                    <button
                                        onClick={() => handleRemoveBranch(branch)}
                                        disabled={loading}
                                        className="p-2 text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                                        title="Remove branch"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
