'use client';

import { useState, useEffect } from 'react';
import {
    Plus,
    Trash2,
    Eye,
    EyeOff,
    Copy,
    Check,
    AlertCircle,
    Info,
    Shield,
    Folder,
    Database,
    ArrowRight
} from 'lucide-react';
import type { EnvVariableTarget } from '@/types';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { NoEnvVarsIllustration } from '@/components/ui/illustrations';

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

    const [envToDelete, setEnvToDelete] = useState<{ id: string, key: string } | null>(null);
    const [suggestion, setSuggestion] = useState<{ key: string, value: string, type: string } | null>(null);

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

        // Check for connection string patterns to suggest connector model
        const connPatterns = [
            { pattern: /^(postgres(ql)?:\/\/|supabase:\/\/)/i, type: 'cloud-sql-postgres' },
            { pattern: /^mysql:\/\//i, type: 'cloud-sql-mysql' },
            { pattern: /^mongodb(\+srv)?:\/\//i, type: 'mongodb-atlas' },
            { pattern: /^redis:\/\//i, type: 'memorystore-redis' }
        ];

        const match = connPatterns.find(p => p.pattern.test(newValue));
        if (match && !suggestion) {
            setSuggestion({ key: newKey, value: newValue, type: match.type });
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

    const handleDelete = async () => {
        if (!envToDelete) return;

        try {
            const success = await deleteEnvVariable(projectId, envToDelete.id);
            if (success && onUpdate) {
                onUpdate();
            }
        } catch (err) {
            console.error('Failed to delete:', err);
        } finally {
            setEnvToDelete(null);
        }
    };

    const getTargetLabel = (target: EnvVariableTarget) => {
        switch (target) {
            case 'build':
                return 'BUILD';
            case 'runtime':
                return 'RUNTIME';
            case 'both':
                return 'BUILD & RUNTIME';
            default:
                return (target as string).toUpperCase();
        }
    };

    // Extract unique groups
    const uniqueGroups = Array.from(new Set(envVariables.map(e => e.group || 'General'))).sort();

    const handleAddAsConnector = async () => {
        if (!suggestion) return;

        setIsSubmitting(true);
        const { addStorageConfig } = useStore.getState();

        try {
            const success = await addStorageConfig(projectId, {
                name: suggestion.key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
                type: suggestion.type as any,
                envKey: suggestion.key,
                environment: newEnvironment
            }, suggestion.value);

            if (success) {
                setNewKey('');
                setNewValue('');
                setIsAdding(false);
                setSuggestion(null);
                if (onUpdate) onUpdate();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Group variables
    const groupedVars = uniqueGroups.reduce((acc, group) => {
        acc[group] = envVariables.filter(e => (e.group || 'General') === group);
        return acc;
    }, {} as Record<string, typeof envVariables>);

    return (
        <Card className="overflow-hidden p-0">
            <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Shield className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Configuration</span>
                        <h3 className="text-xl font-semibold">Environment Variables</h3>
                    </div>
                </div>
                {!isAdding && (
                    <MovingBorderButton
                        onClick={() => setIsAdding(true)}
                        containerClassName="h-10 w-36"
                        className="text-[10px] font-bold uppercase tracking-wider"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Variable
                    </MovingBorderButton>
                )}
            </div>

            <Separator className="bg-[var(--border)]" />

            <div className="p-6">
                {suggestion && (
                    <div className="mb-6 p-4 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl animate-fade-in">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                <Database className="w-5 h-5 text-[var(--primary)]" />
                            </div>
                            <div className="flex-1 space-y-1">
                                <h4 className="text-sm font-semibold text-[var(--foreground)]">Detected Database Connection String</h4>
                                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                                    Deployify has a managed **Database Connector** model that provides secure credential storage via Secret Manager and automated health checks.
                                </p>
                                <div className="flex items-center gap-3 pt-3">
                                    <Button
                                        size="sm"
                                        onClick={handleAddAsConnector}
                                        disabled={isSubmitting}
                                        className="h-8 text-[10px] font-bold uppercase tracking-wider bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white"
                                    >
                                        Use Managed Connector
                                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleAdd}
                                        disabled={isSubmitting}
                                        className="h-8 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"
                                    >
                                        Keep as Plain Variable
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mb-6 p-3 bg-[var(--error-bg)] border border-[var(--error)]/50 rounded-md flex items-center gap-3 text-[var(--error)] text-[10px] font-bold uppercase tracking-wider">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {isAdding && (
                <div className="mb-8 p-4 border border-[var(--border)] rounded-md bg-[var(--background)] animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Key</Label>
                            <Input
                                type="text"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                                placeholder="API_KEY"
                                className="font-mono text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Value</Label>
                            <Input
                                type={newIsSecret ? 'password' : 'text'}
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                placeholder="secret-value"
                                className="font-mono text-sm"
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label className="text-sm font-semibold">Group (Optional)</Label>
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

                    <div className="flex flex-col md:flex-row md:items-start gap-8 mb-6">
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]/50">
                            <Switch
                                id="is-secret"
                                checked={newIsSecret}
                                onCheckedChange={setNewIsSecret}
                            />
                            <Label htmlFor="is-secret" className="flex items-center gap-1.5 cursor-pointer text-sm font-semibold">
                                <Shield className="w-4 h-4 text-[var(--info)]" />
                                Secret (Encrypted)
                            </Label>
                        </div>

                        <div className="flex-1 space-y-4">
                            <div className="space-y-2">
                                <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider block">Target Environment Type</span>
                                <SegmentedControl
                                    options={[
                                        { value: 'both', label: 'BUILD & RUNTIME' },
                                        { value: 'build', label: 'BUILD ONLY' },
                                        { value: 'runtime', label: 'RUNTIME ONLY' }
                                    ]}
                                    value={newTarget}
                                    onChange={(v) => setNewTarget(v as EnvVariableTarget)}
                                />
                            </div>

                            <div className="space-y-2">
                                <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider block">Scope</span>
                                <SegmentedControl
                                    options={[
                                        { value: 'both', label: 'ALL ENVIRONMENTS' },
                                        { value: 'production', label: 'PRODUCTION' },
                                        { value: 'preview', label: 'PREVIEW' }
                                    ]}
                                    value={newEnvironment}
                                    onChange={(v) => setNewEnvironment(v as 'production' | 'preview' | 'both')}
                                />
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
                        <MovingBorderButton
                            onClick={handleAdd}
                            disabled={isSubmitting}
                            loading={isSubmitting}
                            containerClassName="h-10 w-36"
                            className="text-[10px] font-bold uppercase tracking-wider"
                        >
                            Add Variable
                        </MovingBorderButton>
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
                    illustration={NoEnvVarsIllustration}
                />
            ) : (
                <div className="space-y-6">
                    {uniqueGroups.map((group) => (
                        <div key={group} className="space-y-2">
                             <div className="flex items-center gap-2 px-1">
                                <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">{group}</span>
                                <div className="h-[1px] flex-1 bg-[var(--border)]" />
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-[var(--border)] shadow-sm">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] bg-[var(--muted)]/5">
                                            <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] w-[30%]">Key</th>
                                            <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] w-[30%]">Value</th>
                                            <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Type</th>
                                            <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Scope</th>
                                            <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedVars[group].map((env) => (
                                            <tr key={env.id} className="border-b border-[var(--border)] group hover:bg-[var(--card-hover)] transition-colors last:border-0">
                                                <td className="py-4 px-4 font-mono">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[var(--primary)] text-sm">{env.key}</span>
                                                        {env.isSecret && (
                                                            <span title="Secret">
                                                                <Shield className="w-3 h-3 text-[var(--info)]" />
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 text-sm font-mono">
                                                    <div className="flex items-center gap-2 bg-[var(--background)] border border-[var(--border)] px-2.5 py-1.5 rounded-md w-fit max-w-full overflow-hidden shadow-sm">
                                                        {revealedIds.has(env.id) ? (
                                                            <span className="text-[var(--foreground)] truncate">
                                                                {env.isSecret ? (revealedValues[env.id] || 'Loading...') : env.value}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[var(--muted-foreground)]/50">••••••••••••••••</span>
                                                        )}

                                                        <div className="flex items-center ml-2 border-l border-[var(--border)] pl-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => toggleReveal(env)}
                                                                className="h-6 w-6 hover:text-[var(--foreground)] text-[var(--muted-foreground)]"
                                                                title={revealedIds.has(env.id) ? "Hide value" : "Show value"}
                                                            >
                                                                {revealedIds.has(env.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => copyToClipboard(env.id, env.isSecret && revealedValues[env.id] ? revealedValues[env.id] : env.value)}
                                                                className="h-6 w-6 hover:text-[var(--foreground)] text-[var(--muted-foreground)]"
                                                                title="Copy to clipboard"
                                                            >
                                                                {copiedId === env.id ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--muted)]/10 border border-[var(--border)] text-[var(--muted-foreground)]">
                                                        {getTargetLabel(env.target)}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--muted)]/10 border border-[var(--border)] text-[var(--muted-foreground)]">
                                                        {env.environment === 'both' || !env.environment ? 'ALL ENVIRONMENTS' : env.environment.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setEnvToDelete({ id: env.id, key: env.key })}
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

                <div className="mt-6 flex items-start gap-3 p-4 bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-md">
                    <Info className="w-5 h-5 text-[var(--info)] flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-semibold text-[var(--info)] mb-1">Deployment required</p>
                        <p className="text-[var(--muted-foreground)] leading-relaxed">
                            Changes to environment variables will apply to new deployments. Existing deployments will keep their current variables until redeployed.
                        </p>
                    </div>
                </div>
            </div>

            <ConfirmationModal
                isOpen={!!envToDelete}
                onClose={() => setEnvToDelete(null)}
                onConfirm={handleDelete}
                title="Delete Environment Variable"
                description={
                    <span>
                        Are you sure you want to delete <strong>{envToDelete?.key}</strong>? This action cannot be undone.
                    </span>
                }
                confirmText="Delete"
                variant="destructive"
            />
        </Card>
    );
}
