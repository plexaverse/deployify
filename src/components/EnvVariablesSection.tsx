'use client';

import { useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Save, X, Copy, Check } from 'lucide-react';
import type { EnvVariable, EnvVariableTarget } from '@/types';

interface EnvVariablesSectionProps {
    projectId: string;
    initialEnvVariables: EnvVariable[];
    onUpdate?: () => void;
}

export function EnvVariablesSection({
    projectId,
    initialEnvVariables,
    onUpdate,
}: EnvVariablesSectionProps) {
    const [envVariables, setEnvVariables] = useState<EnvVariable[]>(initialEnvVariables);
    const [isAdding, setIsAdding] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newIsSecret, setNewIsSecret] = useState(false);
    const [newTarget, setNewTarget] = useState<EnvVariableTarget>('both');
    const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyToClipboard = async (id: string, value: string) => {
        await navigator.clipboard.writeText(value);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const toggleReveal = (id: string) => {
        const newRevealed = new Set(revealedIds);
        if (newRevealed.has(id)) {
            newRevealed.delete(id);
        } else {
            newRevealed.add(id);
        }
        setRevealedIds(newRevealed);
    };

    const handleAdd = async () => {
        if (!newKey.trim() || !newValue.trim()) {
            setError('Both key and value are required');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/projects/${projectId}/env`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: newKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
                    value: newValue,
                    isSecret: newIsSecret,
                    target: newTarget,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to add environment variable');
            }

            setEnvVariables([...envVariables, data.envVariable]);
            setNewKey('');
            setNewValue('');
            setNewIsSecret(false);
            setNewTarget('both');
            setIsAdding(false);
            setSuccess('Environment variable added successfully');
            setTimeout(() => setSuccess(null), 3000);
            onUpdate?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add environment variable');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (envId: string, key: string) => {
        if (!confirm(`Are you sure you want to delete ${key}?`)) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/projects/${projectId}/env?envId=${envId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete environment variable');
            }

            setEnvVariables(envVariables.filter((env) => env.id !== envId));
            setSuccess('Environment variable deleted successfully');
            setTimeout(() => setSuccess(null), 3000);
            onUpdate?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete environment variable');
        } finally {
            setLoading(false);
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
                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                        Configure environment variables for your deployments
                    </p>
                </div>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="btn btn-primary"
                        disabled={loading}
                    >
                        <Plus className="w-4 h-4" />
                        Add Variable
                    </button>
                )}
            </div>

            {/* Error/Success Messages */}
            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                    {success}
                </div>
            )}

            {/* Add New Variable Form */}
            {isAdding && (
                <div className="mb-6 p-4 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Key</label>
                            <input
                                type="text"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                                placeholder="DATABASE_URL"
                                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Value</label>
                            <input
                                type={newIsSecret ? 'password' : 'text'}
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                placeholder="Enter value..."
                                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                            />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={newIsSecret}
                                onChange={(e) => setNewIsSecret(e.target.checked)}
                                className="w-4 h-4 rounded border-[var(--border)]"
                            />
                            <span className="text-sm">Secret (value will be encrypted)</span>
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-sm">Target:</span>
                            <select
                                value={newTarget}
                                onChange={(e) => setNewTarget(e.target.value as EnvVariableTarget)}
                                className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--card)] text-sm"
                            >
                                <option value="both">Build & Runtime</option>
                                <option value="build">Build Only</option>
                                <option value="runtime">Runtime Only</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAdd}
                            className="btn btn-primary"
                            disabled={loading || !newKey.trim() || !newValue.trim()}
                        >
                            <Save className="w-4 h-4" />
                            {loading ? 'Adding...' : 'Add'}
                        </button>
                        <button
                            onClick={() => {
                                setIsAdding(false);
                                setNewKey('');
                                setNewValue('');
                                setNewIsSecret(false);
                                setNewTarget('both');
                                setError(null);
                            }}
                            className="btn"
                            disabled={loading}
                        >
                            <X className="w-4 h-4" />
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Environment Variables List */}
            {envVariables.length === 0 ? (
                <div className="text-center py-8 text-[var(--muted-foreground)]">
                    <p>No environment variables configured.</p>
                    <p className="text-sm mt-1">Add variables to use during build and runtime.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-4 px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] uppercase">
                        <div className="col-span-3">Key</div>
                        <div className="col-span-5">Value</div>
                        <div className="col-span-2">Target</div>
                        <div className="col-span-2 text-right">Actions</div>
                    </div>
                    {envVariables.map((env) => (
                        <div
                            key={env.id}
                            className="grid grid-cols-12 gap-4 px-3 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] items-center"
                        >
                            <div className="col-span-3 font-mono text-sm truncate" title={env.key}>
                                {env.key}
                            </div>
                            <div className="col-span-5 font-mono text-sm truncate flex items-center gap-2">
                                <span className="truncate">
                                    {env.isSecret && !revealedIds.has(env.id)
                                        ? '••••••••'
                                        : env.value}
                                </span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {env.isSecret && (
                                        <button
                                            onClick={() => toggleReveal(env.id)}
                                            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1"
                                            title={revealedIds.has(env.id) ? 'Hide value' : 'Show value'}
                                            aria-label={revealedIds.has(env.id) ? 'Hide value' : 'Show value'}
                                        >
                                            {revealedIds.has(env.id) ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => copyToClipboard(env.id, env.value)}
                                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1"
                                        title="Copy value"
                                        aria-label="Copy value"
                                    >
                                        {copiedId === env.id ? (
                                            <Check className="w-4 h-4 text-green-400" />
                                        ) : (
                                            <Copy className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div className="col-span-2">
                                <span className="text-xs px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)]">
                                    {getTargetLabel(env.target)}
                                </span>
                            </div>
                            <div className="col-span-2 flex justify-end">
                                <button
                                    onClick={() => handleDelete(env.id, env.key)}
                                    className="text-[var(--muted-foreground)] hover:text-red-400 p-1"
                                    title="Delete variable"
                                    aria-label={`Delete environment variable ${env.key}`}
                                    disabled={loading}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Info */}
            <div className="mt-6 text-xs text-[var(--muted-foreground)]">
                <p><strong>Build:</strong> Available during the build process (npm run build)</p>
                <p><strong>Runtime:</strong> Available when your app is running (passed to Cloud Run)</p>
                <p><strong>Build & Runtime:</strong> Available in both environments</p>
            </div>
        </div>
    );
}
