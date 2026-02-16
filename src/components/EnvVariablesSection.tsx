'use client';

import { useState, useEffect } from 'react';
import {
    Plus,
    Trash2,
    Eye,
    EyeOff,
    Copy,
    Check,
    Loader2,
    AlertCircle,
    Info,
    Shield,
    Folder
} from 'lucide-react';
import type { EnvVariableTarget } from '@/types';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

interface EnvVariablesSectionProps {
    projectId: string;
    onUpdate?: () => void;
}

export function EnvVariablesSection({ projectId, onUpdate }: EnvVariablesSectionProps) {
    const {
        projectEnvVariables: envVariables,
        isLoadingEnv: isLoading,
        fetchProjectEnvVariables,
        addEnvVariable,
        deleteEnvVariable,
        revealEnvVariable
    } = useStore();

    const [isAdding, setIsAdding] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newIsSecret, setNewIsSecret] = useState(false);
    const [newTarget, setNewTarget] = useState<EnvVariableTarget>('both');
    const [newEnvironment, setNewEnvironment] = useState<'production' | 'preview' | 'both'>('both');
    const [newGroup, setNewGroup] = useState('General');

    const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
    const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchProjectEnvVariables(projectId);
    }, [projectId, fetchProjectEnvVariables]);

    const toggleReveal = async (env: typeof envVariables[0]) => {
        const newRevealed = new Set(revealedIds);
        if (newRevealed.has(env.id)) {
            newRevealed.delete(env.id);
            setRevealedIds(newRevealed);
            return;
        }

        // If secret and we don't have the value (or it's masked), fetch it
        if (env.isSecret && !revealedValues[env.id]) {
            const value = await revealEnvVariable(projectId, env.id);
            if (value) {
                setRevealedValues(prev => ({ ...prev, [env.id]: value }));
            }
        }

        newRevealed.add(env.id);
        setRevealedIds(newRevealed);
    };

    const copyToClipboard = async (id: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    const handleAdd = async () => {
        if (!newKey.trim()) {
            setError('Key is required');
            return;
        }

        setError(null);
        setIsSubmitting(true);

        try {
            const success = await addEnvVariable(projectId, {
                key: newKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
                value: newValue,
                isSecret: newIsSecret,
                target: newTarget,
                environment: newEnvironment,
                group: newGroup || 'General',
            });

            if (success) {
                // Reset form
                setNewKey('');
                setNewValue('');
                setNewIsSecret(false);
                setIsAdding(false);
                // Keep the group selection for convenience
                if (onUpdate) onUpdate();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (envId: string, key: string) => {
        if (!confirm(`Are you sure you want to delete ${key}?`)) return;

        try {
            const success = await deleteEnvVariable(projectId, envId);
            if (success && onUpdate) {
                onUpdate();
            }
        } catch (err) {
            console.error('Failed to delete:', err);
        }
    };

    const getTargetLabel = (target: EnvVariableTarget) => {
        switch (target) {
            case 'build':
                return 'Build';
            case 'runtime':
                return 'Runtime';
            case 'both':
                return 'Build & Runtime';
            default:
                return target;
        }
    };

    // Extract unique groups
    const uniqueGroups = Array.from(new Set(envVariables.map(e => e.group || 'General'))).sort();

    // Group variables
    const groupedVars = uniqueGroups.reduce((acc, group) => {
        acc[group] = envVariables.filter(e => (e.group || 'General') === group);
        return acc;
    }, {} as Record<string, typeof envVariables>);

    return (
        <Card>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-semibold mb-1">Environment Variables</h2>
                    <p className="text-sm text-[var(--muted-foreground)]">
                        Variables that are available to your build and runtime environments
                    </p>
                </div>
                <Button
                    onClick={() => setIsAdding(!isAdding)}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Variable
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
                            <Label>Key</Label>
                            <Input
                                type="text"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                                placeholder="API_KEY"
                                className="font-mono text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Value</Label>
                            <Input
                                type={newIsSecret ? 'password' : 'text'}
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                placeholder="secret-value"
                                className="font-mono text-sm"
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>Group (Optional)</Label>
                            <div className="relative">
                                <Input
                                    type="text"
                                    list="existing-groups"
                                    value={newGroup}
                                    onChange={(e) => setNewGroup(e.target.value)}
                                    placeholder="e.g. Database, Auth, General"
                                />
                                <datalist id="existing-groups">
                                    {uniqueGroups.map(group => (
                                        <option key={group} value={group} />
                                    ))}
                                    {!uniqueGroups.includes('General') && <option value="General" />}
                                    {!uniqueGroups.includes('Database') && <option value="Database" />}
                                    {!uniqueGroups.includes('Auth') && <option value="Auth" />}
                                    {!uniqueGroups.includes('API') && <option value="API" />}
                                </datalist>
                                <Folder className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 mb-6">
                        <div className="flex items-center gap-2">
                            <input
                                id="is-secret"
                                type="checkbox"
                                checked={newIsSecret}
                                onChange={(e) => setNewIsSecret(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-[var(--primary)]"
                            />
                            <Label htmlFor="is-secret" className="flex items-center gap-1.5 cursor-pointer">
                                <Shield className="w-3.5 h-3.5 text-blue-400" />
                                Secret (Encrypted)
                            </Label>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-medium w-24">Type:</span>
                                <div className="flex items-center gap-4">
                                    {(['both', 'build', 'runtime'] as EnvVariableTarget[]).map((t) => (
                                        <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="target"
                                                checked={newTarget === t}
                                                onChange={() => setNewTarget(t)}
                                                className="w-4 h-4 border-gray-300 text-[var(--primary)]"
                                            />
                                            <span className="text-sm capitalize">{t === 'both' ? 'Build & Runtime' : t}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <span className="text-sm font-medium w-24">Scope:</span>
                                <div className="flex items-center gap-4">
                                    {(['both', 'production', 'preview'] as const).map((e) => (
                                        <label key={e} className="flex items-center gap-1.5 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="environment"
                                                checked={newEnvironment === e}
                                                onChange={() => setNewEnvironment(e)}
                                                className="w-4 h-4 border-gray-300 text-[var(--primary)]"
                                            />
                                            <span className="text-sm capitalize">{e === 'both' ? 'All Environments' : e}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
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
                            Add Variable
                        </Button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex flex-col gap-2 py-6">
                     <Skeleton className="h-12 w-full" />
                     <Skeleton className="h-12 w-full" />
                     <Skeleton className="h-12 w-full" />
                </div>
            ) : envVariables.length === 0 ? (
                <EmptyState
                    title="No environment variables yet"
                    description="Add keys like API_KEY, DATABASE_URL, etc. to configure your app at build and runtime."
                    icon={Plus}
                />
            ) : (
                <div className="space-y-6">
                    {uniqueGroups.map((group) => (
                        <div key={group} className="space-y-2">
                             <div className="flex items-center gap-2 px-1">
                                <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">{group}</span>
                                <div className="h-[1px] flex-1 bg-[var(--border)]" />
                            </div>

                            <div className="overflow-x-auto rounded-md border border-[var(--border)]">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] bg-[var(--muted)]/20">
                                            <th className="py-3 px-4 font-semibold text-sm w-[30%]">Key</th>
                                            <th className="py-3 px-4 font-semibold text-sm w-[30%]">Value</th>
                                            <th className="py-3 px-4 font-semibold text-sm">Type</th>
                                            <th className="py-3 px-4 font-semibold text-sm">Scope</th>
                                            <th className="py-3 px-4 font-semibold text-sm text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedVars[group].map((env) => (
                                            <tr key={env.id} className="border-b border-[var(--border)] group hover:bg-[var(--muted)]/10 transition-colors last:border-0">
                                                <td className="py-3 px-4 text-sm font-mono">
                                                    <div className="flex items-center gap-2">
                                                        {env.key}
                                                        {env.isSecret && (
                                                            <span title="Secret">
                                                                <Shield className="w-3 h-3 text-blue-400" />
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-sm font-mono">
                                                    <div className="flex items-center gap-2 bg-[var(--muted)]/50 px-2 py-1 rounded w-fit max-w-full overflow-hidden">
                                                        {revealedIds.has(env.id) ? (
                                                            <span className="text-[var(--foreground)] truncate">
                                                                {env.isSecret ? (revealedValues[env.id] || 'Loading...') : env.value}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[var(--muted-foreground)]">••••••••••••••••</span>
                                                        )}

                                                        <div className="flex items-center ml-2 border-l border-[var(--border)] pl-1.5 gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                            <button
                                                                onClick={() => toggleReveal(env)}
                                                                className="p-1 hover:text-[var(--foreground)] text-[var(--muted-foreground)] transition-colors"
                                                                title={revealedIds.has(env.id) ? "Hide value" : "Show value"}
                                                            >
                                                                {revealedIds.has(env.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                            </button>
                                                            <button
                                                                onClick={() => copyToClipboard(env.id, env.isSecret && revealedValues[env.id] ? revealedValues[env.id] : env.value)}
                                                                className="p-1 hover:text-[var(--foreground)] text-[var(--muted-foreground)] transition-colors"
                                                                title="Copy to clipboard"
                                                            >
                                                                {copiedId === env.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--muted)] border border-[var(--border)] capitalize text-[var(--muted-foreground)]">
                                                        {getTargetLabel(env.target)}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--muted)] border border-[var(--border)] capitalize">
                                                        {env.environment === 'both' || !env.environment ? 'All Envs' : env.environment}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(env.id, env.key)}
                                                        className="text-[var(--muted-foreground)] hover:text-[var(--error)] hover:bg-[var(--error-bg)] h-8 w-8 p-0"
                                                        title="Delete environment variable"
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
                    ))}
                </div>
            )}

            <div className="mt-6 flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-md">
                <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                    <p className="font-medium text-blue-400 mb-1 text-sm">Deployment required</p>
                    <p className="text-[var(--muted-foreground)] leading-relaxed">
                        Changes to environment variables will apply to new deployments. Existing deployments will keep their current variables until redeployed.
                    </p>
                </div>
            </div>
        </Card>
    );
}
