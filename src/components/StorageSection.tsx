'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
    Database,
    Plus,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Server,
    ExternalLink,
    Loader2,
    Activity,
    RefreshCw,
    TrendingUp,
    Cpu,
    HardDrive,
    Zap,
    History as HistoryIcon,
    GitBranch
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
import type { StorageType, StorageConfig, Backup, Migration } from '@/types';

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
        validateStorageConnection,
        syncStorageStatus,
        rotateStorageCredentials
    } = useStore();

    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState<StorageType>('cloud-sql-postgres');
    const [connectionString, setConnectionString] = useState('');
    const [envKey, setEnvKey] = useState('');
    const [environment, setEnvironment] = useState<'production' | 'preview' | 'both'>('both');
    const [provision, setProvision] = useState(false);
    const [autoSync, setAutoSync] = useState(false);
    const [supabaseId, setSupabaseId] = useState('');
    const [mongodbGroupId, setMongodbGroupId] = useState('');
    const [mongodbClusterName, setMongodbClusterName] = useState('');
    const [planetscaleOrg, setPlanetscaleOrg] = useState('');
    const [planetscaleDb, setPlanetscaleDb] = useState('');
    const [providerApiKey, setProviderApiKey] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [storageToDelete, setStorageToDelete] = useState<StorageConfig | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteResource, setDeleteResource] = useState(false);
    const [validatingId, setValidatingId] = useState<string | null>(null);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [isRotating, setIsRotating] = useState<string | null>(null);
    const [isScaling, setIsScaling] = useState<StorageConfig | null>(null);
    const [scaleTier, setScaleTier] = useState('');
    const [scaleSizeGb, setScaleSizeGb] = useState(1);
    const [metrics, setMetrics] = useState<Record<string, { cpuUtilization: number, memoryUtilization: number, diskUtilization?: number }>>({});
    const [isLoadingMetrics, setIsLoadingMetrics] = useState<Record<string, boolean>>({});
    const [rotateConnectionString, setRotateConnectionString] = useState('');
    const [isManagingBackups, setIsManagingBackups] = useState<StorageConfig | null>(null);
    const [backups, setBackups] = useState<Backup[]>([]);
    const [isLoadingBackups, setIsLoadingBackups] = useState(false);
    const [backupDescription, setBackupDescription] = useState('');
    const [isManagingMigrations, setIsManagingMigrations] = useState<StorageConfig | null>(null);
    const [migrations, setMigrations] = useState<Migration[]>([]);
    const [isLoadingMigrations, setIsLoadingMigrations] = useState(false);
    const [migrationCommand, setMigrationCommand] = useState('prisma migrate deploy');
    const [activeMigrationOp, setActiveMigrationOp] = useState<string | null>(null);
    const [migrationStatus, setMigrationStatus] = useState<'QUEUED' | 'WORKING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'TIMEOUT' | null>(null);
    const [migrationLogs, setMigrationLogs] = useState('');
    const [migrationError, setMigrationError] = useState<string | null>(null);

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
            const metadata: Record<string, unknown> = { provisioned: provision, autoSync };
            if (autoSync) {
                metadata.providerApiKey = providerApiKey;
                if (type === 'supabase') metadata.supabaseId = supabaseId;
                if (type === 'mongodb-atlas') {
                    metadata.groupId = mongodbGroupId;
                    metadata.clusterName = mongodbClusterName;
                }
                if (type === 'planetscale') {
                    metadata.organization = planetscaleOrg;
                    metadata.database = planetscaleDb;
                }
            }

            const success = await addStorageConfig(projectId, {
                name,
                type,
                environment,
                envKey,
                metadata
            }, provision ? '' : connectionString, provision);

            if (success) {
                resetForm();
                if (onUpdate) onUpdate();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const fetchMigrations = useCallback(async (storageId: string) => {
        setIsLoadingMigrations(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/migrations`);
            const data = await response.json();
            if (data.success) {
                setMigrations(data.migrations);
            }
        } catch (e) {
            console.error('Failed to fetch migrations:', e);
        } finally {
            setIsLoadingMigrations(false);
        }
    }, [projectId]);

    const handleRunMigration = async () => {
        if (!isManagingMigrations) return;
        const result = await useStore.getState().runProjectMigration(projectId, isManagingMigrations.id, migrationCommand);
        if (result.success && result.operationName) {
            setActiveMigrationOp(result.operationName);
            setMigrationStatus('QUEUED');
            setMigrationLogs('Initializing migration execution...');
            setMigrationError(null);

            // Trigger sync to show provisioning/busy status if applicable
            await syncStorageStatus(projectId, isManagingMigrations.id);
        }
    };

    const pollMigrationStatus = useCallback(async () => {
        if (!activeMigrationOp || !isManagingMigrations) return;

        const result = await useStore.getState().fetchMigrationStatus(
            projectId,
            isManagingMigrations.id,
            activeMigrationOp
        );

        setMigrationStatus(result.status as 'QUEUED' | 'WORKING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'TIMEOUT');
        if (result.logs) setMigrationLogs(result.logs);
        if (result.error) setMigrationError(result.error);

        if (result.status === 'SUCCESS' || result.status === 'FAILURE' || result.status === 'CANCELLED' || result.status === 'TIMEOUT') {
            setActiveMigrationOp(null);
            fetchMigrations(isManagingMigrations.id);
        }
    }, [activeMigrationOp, isManagingMigrations, projectId, fetchMigrations]);

    useEffect(() => {
        if (!activeMigrationOp) return;
        const interval = setInterval(pollMigrationStatus, 3000);
        return () => clearInterval(interval);
    }, [activeMigrationOp, pollMigrationStatus]);

    const handleScale = async () => {
        if (!isScaling) return;
        setIsSubmitting(true);
        try {
            const metadata: Record<string, unknown> = {};
            if (isScaling.type.includes('cloud-sql')) {
                metadata.tier = scaleTier;
            } else if (isScaling.type === 'memorystore-redis') {
                metadata.memorySizeGb = scaleSizeGb;
            }

            const success = await updateStorageConfig(projectId, isScaling.id, {
                metadata
            });

            if (success) {
                setIsScaling(null);
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
        setAutoSync(false);
        setProviderApiKey('');
        setSupabaseId('');
        setMongodbGroupId('');
        setMongodbClusterName('');
        setPlanetscaleOrg('');
        setPlanetscaleDb('');
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
            const success = await deleteStorageConfig(projectId, storageToDelete.id, deleteResource);
            if (success && onUpdate) onUpdate();
        } finally {
            setStorageToDelete(null);
            setDeleteResource(false);
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

    const fetchMetrics = useCallback(async (storageId: string) => {
        setIsLoadingMetrics(prev => ({ ...prev, [storageId]: true }));
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/resource-metrics`);
            const data = await response.json();
            if (data.success) {
                setMetrics(prev => ({ ...prev, [storageId]: data.metrics }));
            }
        } catch (e) {
            console.error('Failed to fetch metrics:', e);
        } finally {
            setIsLoadingMetrics(prev => ({ ...prev, [storageId]: false }));
        }
    }, [projectId]);

    useEffect(() => {
        const provisionedConfigs = storageConfigs.filter(c => c.metadata?.provisioned && c.status === 'active');

        // Initial fetch for those that don't have metrics yet
        provisionedConfigs.forEach(c => {
            if (!metrics[c.id] && !isLoadingMetrics[c.id]) {
                fetchMetrics(c.id);
            }
        });

        // Refresh metrics every 60s
        const interval = setInterval(() => {
            provisionedConfigs.forEach(c => fetchMetrics(c.id));
        }, 60000);

        return () => clearInterval(interval);
    }, [storageConfigs, fetchMetrics, metrics, isLoadingMetrics]);

    const handleRotate = async (storageId: string) => {
        if (!rotateConnectionString.trim()) return;
        setIsSubmitting(true);
        try {
            const success = await rotateStorageCredentials(projectId, storageId, rotateConnectionString);
            if (success) {
                setIsRotating(null);
                setRotateConnectionString('');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const fetchBackups = useCallback(async (storageId: string) => {
        setIsLoadingBackups(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/backups`);
            const data = await response.json();
            if (data.success) {
                setBackups(data.backups);
            }
        } catch (e) {
            console.error('Failed to fetch backups:', e);
        } finally {
            setIsLoadingBackups(false);
        }
    }, [projectId]);

    const handleCreateBackup = async () => {
        if (!isManagingBackups) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${isManagingBackups.id}/backups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: backupDescription }),
            });
            const data = await response.json();
            if (data.success) {
                setBackupDescription('');
                fetchBackups(isManagingBackups.id);
            }
        } catch (e) {
            console.error('Failed to create backup:', e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRestoreBackup = async (backupId: string) => {
        if (!isManagingBackups) return;
        if (!confirm('Are you sure you want to restore this backup? This will overwrite current data and the instance will be unavailable during the process.')) return;

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${isManagingBackups.id}/backups/${backupId}/restore`, {
                method: 'POST',
            });
            const data = await response.json();
            if (data.success) {
                setIsManagingBackups(null);
                // Trigger sync to show provisioning status
                await syncStorageStatus(projectId, isManagingBackups.id);
            }
        } catch (e) {
            console.error('Failed to restore backup:', e);
        } finally {
            setIsSubmitting(false);
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
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                                <div className="space-y-0.5">
                                                    <Label className="text-sm font-semibold">API Auto-Sync</Label>
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Sync credentials via provider API</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={autoSync}
                                                    onChange={(e) => setAutoSync(e.target.checked)}
                                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                                />
                                            </div>

                                            {autoSync && (
                                                <div className="p-4 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-lg space-y-4 animate-in slide-in-from-top-2">
                                                    <div className="space-y-2">
                                                        <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Provider API Key</Label>
                                                        <Input
                                                            type="password"
                                                            value={providerApiKey}
                                                            onChange={(e) => setProviderApiKey(e.target.value)}
                                                            placeholder="ENTER PROVIDER API KEY..."
                                                            className="h-8 text-[10px] font-mono placeholder:text-[10px]"
                                                        />
                                                    </div>

                                                    {type === 'supabase' && (
                                                        <div className="space-y-2">
                                                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Supabase Project ID</Label>
                                                            <Input
                                                                value={supabaseId}
                                                                onChange={(e) => setSupabaseId(e.target.value)}
                                                                placeholder="E.G. ABCDEFGHIJKLMNOP"
                                                                className="h-8 text-[10px] font-mono placeholder:text-[10px]"
                                                            />
                                                        </div>
                                                    )}

                                                    {type === 'mongodb-atlas' && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Group ID</Label>
                                                                <Input
                                                                    value={mongodbGroupId}
                                                                    onChange={(e) => setMongodbGroupId(e.target.value)}
                                                                    placeholder="ATLAS GROUP ID"
                                                                    className="h-8 text-[10px] font-mono placeholder:text-[10px]"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Cluster Name</Label>
                                                                <Input
                                                                    value={mongodbClusterName}
                                                                    onChange={(e) => setMongodbClusterName(e.target.value)}
                                                                    placeholder="CLUSTER0"
                                                                    className="h-8 text-[10px] font-mono placeholder:text-[10px]"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {type === 'planetscale' && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Organization</Label>
                                                                <Input
                                                                    value={planetscaleOrg}
                                                                    onChange={(e) => setPlanetscaleOrg(e.target.value)}
                                                                    placeholder="ORG NAME"
                                                                    className="h-8 text-[10px] font-mono placeholder:text-[10px]"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Database</Label>
                                                                <Input
                                                                    value={planetscaleDb}
                                                                    onChange={(e) => setPlanetscaleDb(e.target.value)}
                                                                    placeholder="DB NAME"
                                                                    className="h-8 text-[10px] font-mono placeholder:text-[10px]"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
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
                                    <div className="w-10 h-10 rounded-xl bg-[var(--muted)]/20 flex items-center justify-center shrink-0">
                                        <Database className="w-5 h-5 text-[var(--muted-foreground)]" />
                                    </div>
                                    <div className="space-y-1 w-full">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-sm">{config.name}</h4>
                                            {config.connectionStringSecretId && (
                                                <div className="hidden" id={`cs-${config.id}`}>
                                                    {/* This is a placeholder for checking IAM status in UI */}
                                                </div>
                                            )}
                                            {config.type.includes('cloud-sql') && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-bold uppercase tracking-wider border border-[var(--primary)]/20 flex items-center gap-1">
                                                    <Zap className="w-2.5 h-2.5" />
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
                                        <div className="flex items-center justify-between">
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
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {config.lastSyncedAt && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--success)]">
                                                        SYNCED: {new Date(config.lastSyncedAt).toLocaleTimeString()}
                                                    </span>
                                                )}
                                                {config.lastRotatedAt && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">
                                                        ROTATED: {new Date(config.lastRotatedAt).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {!!config.metadata?.provisioned && config.status === 'active' && (
                                            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-4 animate-fade-in">
                                                <div className="p-2 rounded-lg bg-[var(--muted)]/10 border border-[var(--border)]">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <Cpu className="w-3 h-3 text-[var(--primary)]" />
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">CPU</span>
                                                        </div>
                                                        <span className="text-[10px] font-mono font-bold text-[var(--primary)]">{metrics[config.id]?.cpuUtilization || 0}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-[var(--muted)]/20 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-[var(--primary)] transition-all duration-500"
                                                            style={{ width: `${metrics[config.id]?.cpuUtilization || 0}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="p-2 rounded-lg bg-[var(--muted)]/10 border border-[var(--border)]">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <Zap className="w-3 h-3 text-[var(--success)]" />
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Memory</span>
                                                        </div>
                                                        <span className="text-[10px] font-mono font-bold text-[var(--success)]">{metrics[config.id]?.memoryUtilization || 0}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-[var(--muted)]/20 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-[var(--success)] transition-all duration-500"
                                                            style={{ width: `${metrics[config.id]?.memoryUtilization || 0}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                {metrics[config.id]?.diskUtilization !== undefined && (
                                                    <div className="p-2 rounded-lg bg-[var(--muted)]/10 border border-[var(--border)] col-span-2 md:col-span-1">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <HardDrive className="w-3 h-3 text-[var(--warning)]" />
                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Disk</span>
                                                            </div>
                                                            <span className="text-[10px] font-mono font-bold text-[var(--warning)]">{metrics[config.id]?.diskUtilization}%</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-[var(--muted)]/20 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-[var(--warning)] transition-all duration-500"
                                                                style={{ width: `${metrics[config.id]?.diskUtilization}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {isRotating === config.id && (
                                            <div className="mt-3 p-3 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-lg space-y-3 animate-fade-in">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-bold uppercase tracking-wider">New Connection String</Label>
                                                    <Input
                                                        type="password"
                                                        value={rotateConnectionString}
                                                        onChange={(e) => setRotateConnectionString(e.target.value)}
                                                        placeholder="PASTE NEW CONNECTION STRING..."
                                                        className="font-mono text-[10px] h-8 placeholder:text-[10px]"
                                                    />
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            setIsRotating(null);
                                                            setRotateConnectionString('');
                                                        }}
                                                        disabled={isSubmitting}
                                                        className="h-7 text-[10px] font-bold uppercase tracking-wider"
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleRotate(config.id)}
                                                        disabled={isSubmitting || !rotateConnectionString}
                                                        className="h-7 text-[10px] font-bold uppercase tracking-wider bg-[var(--primary)]"
                                                    >
                                                        Rotate Credentials
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {config.status === 'provisioning' ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleSync(config.id)}
                                            disabled={syncingId === config.id}
                                            className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                            title="Sync Status"
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
                                    {!!config.metadata?.provisioned && config.status === 'active' && (config.type.includes('cloud-sql') || config.type === 'memorystore-redis') && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                setIsScaling(config);
                                                setScaleTier((config.metadata?.tier as string) || 'db-f1-micro');
                                                setScaleSizeGb((config.metadata?.memorySizeGb as number) || 1);
                                            }}
                                            className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                            title="Scale Instance"
                                        >
                                            <TrendingUp className="w-4 h-4" />
                                        </Button>
                                    )}
                                    {!!config.metadata?.provisioned && config.status === 'active' && config.type.includes('cloud-sql') && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                setIsManagingBackups(config);
                                                fetchBackups(config.id);
                                            }}
                                            className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                            title="Manage Backups"
                                        >
                                            <HistoryIcon className="w-4 h-4" />
                                        </Button>
                                    )}
                                    {config.status === 'active' && (config.type.includes('sql') || config.type === 'planetscale') && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                setIsManagingMigrations(config);
                                                fetchMigrations(config.id);
                                            }}
                                            className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                            title="Manage Migrations"
                                        >
                                            <GitBranch className="w-4 h-4" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setIsRotating(isRotating === config.id ? null : config.id)}
                                        className={`h-8 w-8 ${isRotating === config.id ? 'text-[var(--primary)] bg-[var(--primary)]/10' : 'text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10'}`}
                                        title="Rotate Credentials"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${isRotating === config.id ? 'animate-spin' : ''}`} />
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
                isOpen={!!isScaling}
                onClose={() => setIsScaling(null)}
                onConfirm={handleScale}
                title="Scale Storage Instance"
                description={
                    <div className="space-y-4">
                        <p className="text-sm">
                            Adjust the resource allocation for <strong>{isScaling?.name}</strong>. This update will trigger a GCP operation and the instance status will show as provisioning while the scaling is in progress.
                        </p>

                        {isScaling?.type.includes('cloud-sql') ? (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Machine Tier</Label>
                                <NativeSelect
                                    value={scaleTier}
                                    onChange={(e) => setScaleTier(e.target.value)}
                                >
                                    <option value="db-f1-micro">Shared CPU (db-f1-micro) - Free Tier</option>
                                    <option value="db-g1-small">Shared CPU (db-g1-small)</option>
                                    <option value="db-custom-1-3840">1 vCPU, 3.75 GB RAM</option>
                                    <option value="db-custom-2-7680">2 vCPU, 7.5 GB RAM</option>
                                    <option value="db-custom-4-15360">4 vCPU, 15 GB RAM</option>
                                </NativeSelect>
                            </div>
                        ) : isScaling?.type === 'memorystore-redis' ? (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Memory Capacity (GB)</Label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        step="1"
                                        value={scaleSizeGb}
                                        onChange={(e) => setScaleSizeGb(parseInt(e.target.value))}
                                        className="flex-1 accent-[var(--primary)]"
                                    />
                                    <span className="text-sm font-mono font-bold w-12 text-center">{scaleSizeGb} GB</span>
                                </div>
                            </div>
                        ) : null}
                    </div>
                }
                confirmText="Apply Scaling"
                loading={isSubmitting}
            />

            <ConfirmationModal
                isOpen={!!isManagingBackups}
                onClose={() => setIsManagingBackups(null)}
                title="Database Backup Management"
                description={
                    <div className="space-y-6">
                        <div className="p-4 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-xl space-y-4">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Trigger Manual Backup</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={backupDescription}
                                    onChange={(e) => setBackupDescription(e.target.value)}
                                    placeholder="BACKUP DESCRIPTION..."
                                    className="h-9 text-[10px] font-bold uppercase placeholder:text-[10px]"
                                />
                                <Button
                                    onClick={handleCreateBackup}
                                    disabled={isSubmitting}
                                    className="h-9 px-4 text-[10px] font-bold uppercase bg-[var(--primary)]"
                                >
                                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                                    Create
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Backup History</Label>
                            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {isLoadingBackups ? (
                                    <div className="py-8 flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Fetching backups...</span>
                                    </div>
                                ) : backups.length === 0 ? (
                                    <div className="py-8 text-center border border-dashed border-[var(--border)] rounded-xl bg-[var(--muted)]/5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">No backups found</span>
                                    </div>
                                ) : (
                                    backups.map(b => (
                                        <div key={b.id} className="p-3 border border-[var(--border)] rounded-xl bg-[var(--background)] flex items-center justify-between group">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                                                        b.status === 'SUCCESSFUL' ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--error)]/10 text-[var(--error)]"
                                                    )}>
                                                        {b.status}
                                                    </span>
                                                    <span className="text-[10px] font-mono font-bold">{b.id}</span>
                                                </div>
                                                <p className="text-[10px] font-bold uppercase text-[var(--foreground)]">{b.description || 'AUTOMATED BACKUP'}</p>
                                                <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]/60">{new Date(b.startTime).toLocaleString()}</p>
                                            </div>
                                            {b.status === 'SUCCESSFUL' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleRestoreBackup(b.id)}
                                                    disabled={isSubmitting}
                                                    className="h-7 text-[10px] font-bold uppercase tracking-wider border-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    Restore
                                                </Button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                }
                showConfirm={false}
                showCancel={false}
            />

            <ConfirmationModal
                isOpen={!!isManagingMigrations}
                onClose={() => {
                    setIsManagingMigrations(null);
                    setActiveMigrationOp(null);
                    setMigrationStatus(null);
                    setMigrationLogs('');
                    setMigrationError(null);
                }}
                title="Database Migration Management"
                description={
                    <div className="space-y-6">
                        {migrationStatus ? (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-2 h-2 rounded-full animate-pulse",
                                            migrationStatus === 'SUCCESS' ? "bg-[var(--success)]" :
                                            migrationStatus === 'FAILURE' ? "bg-[var(--error)]" :
                                            "bg-[var(--primary)]"
                                        )} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">
                                            Migration Status: {migrationStatus}
                                        </span>
                                    </div>
                                    {activeMigrationOp && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />}
                                </div>

                                <div className="p-4 bg-black/40 border border-[var(--border)] rounded-lg font-mono text-[10px] overflow-hidden">
                                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border)]">
                                        <span className="text-[var(--muted-foreground)] uppercase">Build Logs</span>
                                        <span className="text-[var(--primary)]">{activeMigrationOp?.split('/').pop()?.substring(0, 8)}</span>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                                        {migrationLogs.split('\n').map((line, i) => (
                                            <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
                                                <span className="text-[var(--muted-foreground)] mr-2 opacity-30">{(i + 1).toString().padStart(3, '0')}</span>
                                                <span className={cn(
                                                    line.toLowerCase().includes('error') ? "text-[var(--error)]" :
                                                    line.toLowerCase().includes('success') ? "text-[var(--success)]" :
                                                    "text-[var(--foreground)]/80"
                                                )}>{line}</span>
                                            </div>
                                        ))}
                                        {activeMigrationOp && (
                                            <div className="flex items-center gap-2 text-[var(--primary)] animate-pulse mt-2">
                                                <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full" />
                                                <span>Awaiting output...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {migrationError && (
                                    <div className="p-3 bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-lg flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-[var(--error)] shrink-0 mt-0.5" />
                                        <p className="text-[10px] font-bold uppercase text-[var(--error)]">{migrationError}</p>
                                    </div>
                                )}

                                {!activeMigrationOp && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setMigrationStatus(null);
                                            setMigrationLogs('');
                                            setMigrationError(null);
                                        }}
                                        className="w-full text-[10px] font-bold uppercase tracking-wider"
                                    >
                                        Run Another Migration
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="p-4 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-xl space-y-4 animate-in fade-in">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">Run Manual Migration</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={migrationCommand}
                                        onChange={(e) => setMigrationCommand(e.target.value)}
                                        placeholder="E.G. prisma migrate deploy"
                                        className="h-9 text-[10px] font-mono font-bold placeholder:text-[10px]"
                                    />
                                    <Button
                                        onClick={handleRunMigration}
                                        disabled={isLoading}
                                        className="h-9 px-4 text-[10px] font-bold uppercase bg-[var(--primary)]"
                                    >
                                        Run
                                    </Button>
                                </div>
                                <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
                                    This will trigger a migration operation. Ensure your schema is up to date in the repository.
                                </p>
                            </div>
                        )}

                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Migration History</Label>
                            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {isLoadingMigrations ? (
                                    <div className="py-8 flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Fetching migrations...</span>
                                    </div>
                                ) : migrations.length === 0 ? (
                                    <div className="py-8 text-center border border-dashed border-[var(--border)] rounded-xl bg-[var(--muted)]/5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">No migration history found</span>
                                    </div>
                                ) : (
                                    migrations.map(m => (
                                        <div key={m.id} className="p-3 border border-[var(--border)] rounded-xl bg-[var(--background)] flex items-center justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                                                        m.status === 'SUCCESS' ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--error)]/10 text-[var(--error)]"
                                                    )}>
                                                        {m.status}
                                                    </span>
                                                    <span className="text-[10px] font-mono font-bold">{m.provider?.toUpperCase()}</span>
                                                </div>
                                                <p className="text-[10px] font-bold uppercase text-[var(--foreground)] truncate max-w-[300px]" title={m.name}>{m.name}</p>
                                                <p className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]/60">{new Date(m.appliedAt).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                }
                showConfirm={false}
                showCancel={false}
            />

            <ConfirmationModal
                isOpen={!!storageToDelete}
                onClose={() => {
                    setStorageToDelete(null);
                    setDeleteResource(false);
                }}
                onConfirm={handleDelete}
                title="Delete Storage Connector"
                description={
                    <div className="space-y-4">
                        <p>
                            Are you sure you want to delete <strong>{storageToDelete?.name}</strong>? This will remove the automated credential injection from your deployments.
                        </p>
                        {!!storageToDelete?.metadata?.provisioned && (
                            <div className="p-3 rounded-lg bg-[var(--error)]/5 border border-[var(--error)]/20 flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)]">Delete actual GCP Resource</Label>
                                    <p className="text-[10px] font-bold uppercase text-[var(--error)]/60">Permantently destroy the provisioned instance</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={deleteResource}
                                    onChange={(e) => setDeleteResource(e.target.checked)}
                                    className="w-4 h-4 rounded border-[var(--error)]/30 text-[var(--error)] focus:ring-[var(--error)]"
                                />
                            </div>
                        )}
                    </div>
                }
                confirmText={deleteResource ? "Delete Resource & Disconnect" : "Disconnect"}
                variant="destructive"
            />
        </Card>
    );
}
