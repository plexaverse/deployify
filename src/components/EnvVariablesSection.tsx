'use client';

import { useState, useEffect } from 'react';
import {
    Plus,
    Trash2,
    Eye,
    EyeOff,
    Save,
    X,
    Copy,
    Check,
    Loader2,
    AlertCircle,
    Info,
    Shield
} from 'lucide-react';
import type { EnvVariable, EnvVariableTarget } from '@/types';
import { useStore } from '@/store';

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
        deleteEnvVariable
    } = useStore();

    const [isAdding, setIsAdding] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newIsSecret, setNewIsSecret] = useState(false);
    const [newTarget, setNewTarget] = useState<EnvVariableTarget>('both');

    const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchProjectEnvVariables(projectId);
    }, [projectId, fetchProjectEnvVariables]);

    const toggleReveal = (id: string) => {
        const newRevealed = new Set(revealedIds);
        if (newRevealed.has(id)) {
            newRevealed.delete(id);
        } else {
            newRevealed.add(id);
        }
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
            });

            if (success) {
                // Reset form
                setNewKey('');
                setNewValue('');
                setNewIsSecret(false);
                setIsAdding(false);
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

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold">Environment Variables</h2>
                    <p className="text-sm text-[var(--muted-foreground)]">
                        Variables that are available to your build and runtime environments
                    </p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Add Variable
                </button>
            </div>

            {error && (
                <div className="mb-6 p-3 bg-red-500/10 border border-red-500/50 rounded-md flex items-center gap-3 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {isAdding && (
                <div className="mb-8 p-4 border border-[var(--border)] rounded-md bg-[var(--background)]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Key</label>
                            <input
                                type="text"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                                placeholder="API_KEY"
                                className="input w-full font-mono text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Value</label>
                            <input
                                type={newIsSecret ? 'password' : 'text'}
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                placeholder="secret-value"
                                className="input w-full font-mono text-sm"
                            />
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
                            <label htmlFor="is-secret" className="text-sm font-medium flex items-center gap-1.5 cursor-pointer">
                                <Shield className="w-3.5 h-3.5 text-blue-400" />
                                Secret (Encrypted)
                            </label>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-sm font-medium">Environment:</span>
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
                                        <span className="text-sm capitalize">{t}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setIsAdding(false)}
                            className="btn btn-ghost"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={isSubmitting}
                            className="btn btn-primary"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Adding...
                                </>
                            ) : (
                                'Add Variable'
                            )}
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
                </div>
            ) : envVariables.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-[var(--border)] rounded-md">
                    <div className="bg-[var(--muted)] w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Plus className="w-6 h-6 text-[var(--muted-foreground)]" />
                    </div>
                    <p className="text-[var(--muted-foreground)]">No environment variables yet</p>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1 max-w-[280px] mx-auto">
                        Add keys like API_KEY, DATABASE_URL, etc. to configure your app at build and runtime.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-[var(--border)]">
                                <th className="py-3 px-4 font-semibold text-sm">Key</th>
                                <th className="py-3 px-4 font-semibold text-sm">Value</th>
                                <th className="py-3 px-4 font-semibold text-sm">Environment</th>
                                <th className="py-3 px-4 font-semibold text-sm text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {envVariables.map((env) => (
                                <tr key={env.id} className="border-b border-[var(--border)] group hover:bg-[var(--muted)]/30 transition-colors">
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
                                        <div className="flex items-center gap-2 bg-[var(--muted)]/50 px-2 py-1 rounded w-fit">
                                            {revealedIds.has(env.id) ? (
                                                <span className="text-[var(--foreground)]">{env.value}</span>
                                            ) : (
                                                <span className="text-[var(--muted-foreground)]">••••••••••••••••</span>
                                            )}

                                            <div className="flex items-center ml-2 border-l border-[var(--border)] pl-1.5 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => toggleReveal(env.id)}
                                                    className="p-1 hover:text-[var(--foreground)] text-[var(--muted-foreground)]"
                                                    title={revealedIds.has(env.id) ? "Hide value" : "Show value"}
                                                >
                                                    {revealedIds.has(env.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                </button>
                                                <button
                                                    onClick={() => copyToClipboard(env.id, env.value)}
                                                    className="p-1 hover:text-[var(--foreground)] text-[var(--muted-foreground)]"
                                                    title="Copy to clipboard"
                                                >
                                                    {copiedId === env.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--muted)] border border-[var(--border)] capitalize">
                                            {getTargetLabel(env.target)}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <button
                                            onClick={() => handleDelete(env.id, env.key)}
                                            className="p-2 text-[var(--muted-foreground)] hover:text-red-500 rounded-md hover:bg-red-500/10 transition-colors"
                                            title="Delete environment variable"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
        </div>
    );
}
