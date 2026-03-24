'use client';

import { useState, useEffect } from 'react';
import {
    Database,
    Plus,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Server,
    ExternalLink,
    Loader2,
    Activity
} from 'lucide-react';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState } from '@/components/EmptyState';
import { NoEnvVarsIllustration } from '@/components/ui/illustrations';
import type { StorageType, StorageConfig } from '@/types';

interface StorageSectionProps {
    projectId: string;
    onUpdate?: () => void;
}

const STORAGE_TYPES = [
    { value: 'cloud-sql-postgres', label: 'CLOUD SQL (POSTGRES)', category: 'GCP NATIVE' },
    { value: 'cloud-sql-mysql', label: 'CLOUD SQL (MYSQL)', category: 'GCP NATIVE' },
    { value: 'firestore', label: 'FIRESTORE', category: 'GCP NATIVE' },
    { value: 'memorystore-redis', label: 'MEMORYSTORE (REDIS)', category: 'GCP NATIVE' },
    { value: 'supabase', label: 'SUPABASE', category: 'EXTERNAL' },
    { value: 'mongodb-atlas', label: 'MONGODB ATLAS', category: 'EXTERNAL' },
    { value: 'planetscale', label: 'PLANETSCALE', category: 'EXTERNAL' },
    { value: 'generic', label: 'GENERIC DATABASE', category: 'OTHER' },
] as const;

export function StorageSection({ projectId, onUpdate }: StorageSectionProps) {
    const {
        projectStorageConfigs: storageConfigs,
        isLoadingStorage: isLoading,
        fetchProjectStorage,
        addStorageConfig,
        updateStorageConfig,
        deleteStorageConfig,
        rotateStorageCredentials,
        validateStorageConnection,
        syncStorageStatus
    } = useStore();

    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState<StorageType>('cloud-sql-postgres');
    const [connectionString, setConnectionString] = useState('');
    const [envKey, setEnvKey] = useState('');
    const [environment, setEnvironment] = useState<'production' | 'preview' | 'both'>('both');
    const [provision, setProvision] = useState(false);
    const [autoSync, setAutoSync] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [storageToDelete, setStorageToDelete] = useState<StorageConfig | null>(null);
    const [storageToRotate, setStorageToRotate] = useState<StorageConfig | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [validatingId, setValidatingId] = useState<string | null>(null);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    useEffect(() => {
        fetchProjectStorage(projectId);
    }, [projectId, fetchProjectStorage]);

    useEffect(() => {
        if (!isAdding && !editingId) return;

        // Auto-set envKey based on type if it's empty
        if (!envKey) {
            if (type === 'memorystore-redis') setEnvKey('REDIS_URL');
            else if (type === 'mongodb-atlas') setEnvKey('MONGODB_URI');
            else setEnvKey('DATABASE_URL');
        }
    }, [type, isAdding, editingId, envKey]);

    const handleAdd = async () => {
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            const success = await addStorageConfig(projectId, {
                name,
                type,
                environment,
                envKey,
                metadata: { provisioned: provision }
            }, provision ? '' : connectionString, provision);

            if (success) {
                resetForm();
                if (onUpdate) onUpdate();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingId || !name.trim()) return;

        setIsSubmitting(true);
        try {
            const success = await updateStorageConfig(projectId, editingId, {
                name,
                type,
                environment,
                envKey
            }, connectionString);

            if (success) {
                resetForm();
                if (onUpdate) onUpdate();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setIsAdding(false);
        setEditingId(null);
        setName('');
        setConnectionString('');
        setEnvKey('');
        setType('cloud-sql-postgres');
        setEnvironment('both');
        setProvision(false);
    };

    const startEditing = (config: StorageConfig) => {
        setEditingId(config.id);
        setName(config.name);
        setType(config.type);
        setEnvironment(config.environment);
        setEnvKey(config.envKey || '');
        setConnectionString(''); // Don't show old connection string
        setIsAdding(false);
    };

    const handleDelete = async () => {
        if (!storageToDelete) return;

        try {
            const success = await deleteStorageConfig(projectId, storageToDelete.id);
            if (success && onUpdate) onUpdate();
        } finally {
            setStorageToDelete(null);
        }
    };

    const handleRotate = async () => {
        if (!storageToRotate || !connectionString.trim()) return;

        setIsSubmitting(true);
        try {
            const success = await rotateStorageCredentials(projectId, storageToRotate.id, connectionString);
            if (success) {
                setStorageToRotate(null);
                setConnectionString('');
                if (onUpdate) onUpdate();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleValidate = async (storageId: string) => {
        setValidatingId(storageId);
        try {
            const result = await validateStorageConnection(projectId, storageId);
            if (result.valid) {
                // Status is updated via store which updates projectStorageConfigs
            }
        } finally {
            setValidatingId(null);
        }
    };

    const handleSync = async (storageId: string) => {
        setSyncingId(storageId);
        try {
            await syncStorageStatus(projectId, storageId);
        } finally {
            setSyncingId(null);
        }
    };

    const getStatusIcon = (status: string, id: string) => {
        if (validatingId === id) {
            return <Loader2 className="w-4 h-4 text-[var(--info)] animate-spin" />;
        }

        switch (status) {
            case 'active':
                return <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />;
            case 'error':
                return <AlertCircle className="w-4 h-4 text-[var(--error)]" />;
            case 'provisioning':
                return <Loader2 className="w-4 h-4 text-[var(--info)] animate-spin" />;
            default:
                return <Server className="w-4 h-4 text-[var(--muted-foreground)]" />;
        }
    };

    return (
        <Card className="overflow-hidden p-0">
            <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Database className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Infrastructure</span>
                        <h3 className="text-xl font-semibold">Storage & Databases</h3>
                    </div>
                </div>
                {!isAdding && (
                    <MovingBorderButton
                        onClick={() => setIsAdding(true)}
                        containerClassName="h-10 w-44"
                        className="text-[10px] font-bold uppercase tracking-wider"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Connect Database
                    </MovingBorderButton>
                )}
            </div>

            <Separator className="bg-[var(--border)]" />

            <div className="p-6">
                {(isAdding || editingId) && (
                    <div className="mb-8 p-6 border border-[var(--border)] rounded-xl bg-[var(--background)] animate-fade-in space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Connector Name</Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="E.G. PRIMARY POSTGRES"
                                    className="placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Database Type</Label>
                                <NativeSelect
                                    value={type}
                                    onChange={(e) => setType(e.target.value as StorageType)}
                                >
                                    <optgroup label="GCP NATIVE">
                                        {STORAGE_TYPES.filter(t => t.category === 'GCP NATIVE').map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="MANAGED EXTERNAL">
                                        {STORAGE_TYPES.filter(t => t.category === 'EXTERNAL').map(t => (
                                            <option key={t.value} value={t.value} disabled={provision}>{t.label}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="OTHER">
                                        {STORAGE_TYPES.filter(t => t.category === 'OTHER').map(t => (
                                            <option key={t.value} value={t.value} disabled={provision}>{t.label}</option>
                                        ))}
                                    </optgroup>
                                </NativeSelect>
                            </div>
                        </div>

                        {!editingId && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Setup Method</Label>
                                <SegmentedControl
                                    options={[
                                        { value: 'connect', label: 'CONNECT EXISTING' },
                                        { value: 'provision', label: 'PROVISION NEW' }
                                    ]}
                                    value={provision ? 'provision' : 'connect'}
                                    onChange={(v) => {
                                        setProvision(v === 'provision');
                                        if (v === 'provision' && (type === 'supabase' || type === 'mongodb-atlas' || type === 'planetscale' || type === 'generic')) {
                                            setType('cloud-sql-postgres');
                                        }
                                    }}
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {!provision ? (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Connection String / Secret</Label>
                                    <Input
                                        type="password"
                                        value={connectionString}
                                        onChange={(e) => setConnectionString(e.target.value)}
                                        placeholder={editingId ? "LEAVE BLANK TO KEEP CURRENT SECRET" : "POSTGRESQL://USER:PASSWORD@HOST:PORT/DB"}
                                        className="font-mono text-sm placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                    />
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            Stored securely in Google Cloud Secret Manager.
                                        </p>
                                    </div>
                                    {(type === 'supabase' || type === 'mongodb-atlas' || type === 'planetscale') && !editingId && (
                                        <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-semibold">API Auto-Sync</Label>
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Sync credentials via provider API</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={autoSync}
                                                onChange={(e) => setAutoSync(e.target.checked)}
                                                className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-4 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-lg flex items-start gap-3">
                                    <Activity className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                        Deployify will automatically provision a new <strong>{type.replace(/-/g, ' ')}</strong> instance in your project&apos;s default region and manage all credentials.
                                    </div>
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Environment Variable Key</Label>
                                <Input
                                    value={envKey}
                                    onChange={(e) => setEnvKey(e.target.value)}
                                    placeholder="DATABASE_URL"
                                    className="font-mono text-sm placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    This key will be injected into your application at runtime.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Environment Scope</Label>
                            <SegmentedControl
                                options={[
                                    { value: 'both', label: 'ALL ENVIRONMENTS' },
                                    { value: 'production', label: 'PRODUCTION ONLY' },
                                    { value: 'preview', label: 'PREVIEW ONLY' }
                                ]}
                                value={environment}
                            onChange={(v) => setEnvironment(v as 'production' | 'preview' | 'both')}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="ghost"
                                onClick={resetForm}
                                disabled={isSubmitting}
                                className="text-[10px] font-bold uppercase tracking-wider"
                            >
                                Cancel
                            </Button>
                            <MovingBorderButton
                                onClick={editingId ? handleUpdate : handleAdd}
                                disabled={isSubmitting || !name}
                                loading={isSubmitting}
                                containerClassName="h-10 w-44"
                                className="text-[10px] font-bold uppercase tracking-wider"
                            >
                                {editingId ? 'Update Connector' : 'Create Connector'}
                            </MovingBorderButton>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                    </div>
                ) : storageConfigs.length === 0 ? (
                    <EmptyState
                        title="No databases connected"
                        description="Connect your GCP-native databases or external providers like Supabase to automate credential management."
                        illustration={NoEnvVarsIllustration}
                    />
                ) : (
                    <div className="space-y-4">
                        {storageConfigs.map((config) => (
                            <div
                                key={config.id}
                                className="group flex items-center justify-between p-4 border border-[var(--border)] rounded-xl bg-[var(--card)]/50 hover:bg-[var(--card-hover)] transition-all"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-[var(--muted)]/20 flex items-center justify-center shrink-0">
                                        <Database className="w-5 h-5 text-[var(--muted-foreground)]" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-sm">{config.name}</h4>
                                            {config.connectionStringSecretId && (
                                                <div className="hidden" id={`cs-${config.id}`}>
                                                    {/* This is a placeholder for checking IAM status in UI */}
                                                </div>
                                            )}
                                            {config.type.includes('cloud-sql') && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-bold uppercase tracking-wider border border-[var(--primary)]/20">
                                                    IAM AUTH
                                                </span>
                                            )}
                                            {getStatusIcon(config.status, config.id)}
                                            {config.status === 'error' && config.lastError && (
                                                <span className="text-[10px] font-bold text-[var(--error)] uppercase truncate max-w-[200px]" title={config.lastError}>
                                                    — {config.lastError}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--muted)]/10 px-2 py-0.5 rounded-full border border-[var(--border)]">
                                                {config.type.replace(/-/g, ' ')}
                                            </span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                {config.envKey || (config.type === 'memorystore-redis' ? 'REDIS_URL' : config.type === 'mongodb-atlas' ? 'MONGODB_URI' : 'DATABASE_URL')}
                                            </span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                {config.environment === 'both' ? 'ALL ENVIRONMENTS' : config.environment}
                                            </span>
                                            {config.metadata?.lastSyncedAt && (
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--success)]">
                                                    SYNCED: {new Date(config.metadata.lastSyncedAt as string).toLocaleTimeString()}
                                                </span>
                                            )}
                                            {config.metadata?.lastRotatedAt && (
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--info)]">
                                                    ROTATED: {new Date(config.metadata.lastRotatedAt as string).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {config.status === 'provisioning' || config.metadata?.autoSync === true ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleSync(config.id)}
                                            disabled={syncingId === config.id}
                                            className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                            title={config.metadata?.autoSync ? "Sync Now" : "Sync Status"}
                                        >
                                            <Activity className={`w-4 h-4 ${syncingId === config.id ? 'animate-spin' : ''}`} />
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleValidate(config.id)}
                                            disabled={validatingId === config.id}
                                            className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                            title="Check Connection"
                                        >
                                            <Activity className={`w-4 h-4 ${validatingId === config.id ? 'animate-pulse' : ''}`} />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setStorageToRotate(config)}
                                        className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--info)] hover:bg-[var(--info-bg)]"
                                        title="Rotate Credentials"
                                    >
                                        <Activity className="w-4 h-4 rotate-90" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => startEditing(config)}
                                        className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                        title="Edit Connector"
                                    >
                                        <Server className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setStorageToDelete(config)}
                                        className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--error)] hover:bg-[var(--error-bg)]"
                                        title="Disconnect"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-6 flex items-start gap-3 p-4 bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-xl">
                    <ExternalLink className="w-5 h-5 text-[var(--info)] flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-semibold text-[var(--info)] mb-1">Managed Connectivity</p>
                        <p className="text-[var(--muted-foreground)] leading-relaxed">
                            Deployify automatically injects the appropriate environment variables (like <code className="text-[10px] font-bold uppercase tracking-wider bg-[var(--muted)]/20 px-1 rounded">DATABASE_URL</code>) into your services based on these connectors.
                        </p>
                    </div>
                </div>
            </div>

            <ConfirmationModal
                isOpen={!!storageToDelete}
                onClose={() => setStorageToDelete(null)}
                onConfirm={handleDelete}
                title="Delete Storage Connector"
                description={
                    <span>
                        Are you sure you want to delete <strong>{storageToDelete?.name}</strong>? This will remove the automated credential injection but will NOT delete your actual database in GCP or external providers.
                    </span>
                }
                confirmText="Disconnect"
                variant="destructive"
            />

            <ConfirmationModal
                isOpen={!!storageToRotate}
                onClose={() => {
                    setStorageToRotate(null);
                    setConnectionString('');
                }}
                onConfirm={handleRotate}
                title="Rotate Credentials"
                description={
                    <div className="space-y-4 pt-2">
                        <p>
                            Enter the new connection string for <strong>{storageToRotate?.name}</strong>.
                            This will update the secret in GCP Secret Manager immediately.
                        </p>
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">New Connection String</Label>
                            <Input
                                type="password"
                                value={connectionString}
                                onChange={(e) => setConnectionString(e.target.value)}
                                placeholder="POSTGRESQL://USER:PASSWORD@HOST:PORT/DB"
                                className="font-mono text-sm"
                            />
                        </div>
                    </div>
                }
                confirmText="Rotate Credentials"
                variant="info"
                disabled={!connectionString.trim() || isSubmitting}
                loading={isSubmitting}
            />
        </Card>
    );
}
