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
    Loader2
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
        deleteStorageConfig,
        validateStorageConnection
    } = useStore();

    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState<StorageType>('cloud-sql-postgres');
    const [connectionString, setConnectionString] = useState('');
    const [environment, setEnvironment] = useState<'production' | 'preview' | 'both'>('both');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [storageToDelete, setStorageToDelete] = useState<StorageConfig | null>(null);

    useEffect(() => {
        fetchProjectStorage(projectId);
    }, [projectId, fetchProjectStorage]);

    const handleAdd = async () => {
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            const success = await addStorageConfig(projectId, {
                name,
                type,
                environment
            }, connectionString);

            if (success) {
                setIsAdding(false);
                setName('');
                setConnectionString('');
                if (onUpdate) onUpdate();
            }
        } finally {
            setIsSubmitting(false);
        }
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

    const getStatusIcon = (status: string) => {
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
                {isAdding && (
                    <div className="mb-8 p-6 border border-[var(--border)] rounded-xl bg-[var(--background)] animate-fade-in space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Connector Name</Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Primary Postgres"
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
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="OTHER">
                                        {STORAGE_TYPES.filter(t => t.category === 'OTHER').map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </optgroup>
                                </NativeSelect>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Connection String / Secret</Label>
                            <Input
                                type="password"
                                value={connectionString}
                                onChange={(e) => setConnectionString(e.target.value)}
                                placeholder="postgresql://user:password@host:port/db"
                                className="font-mono text-xs"
                            />
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" />
                                This value will be stored securely in Google Cloud Secret Manager.
                            </p>
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
                                onClick={() => setIsAdding(false)}
                                disabled={isSubmitting}
                                className="text-[10px] font-bold uppercase tracking-wider"
                            >
                                Cancel
                            </Button>
                            <MovingBorderButton
                                onClick={handleAdd}
                                disabled={isSubmitting || !name}
                                loading={isSubmitting}
                                containerClassName="h-10 w-44"
                                className="text-[10px] font-bold uppercase tracking-wider"
                            >
                                Create Connector
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
                                            {getStatusIcon(config.status)}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--muted)]/10 px-2 py-0.5 rounded-full border border-[var(--border)]">
                                                {config.type.replace(/-/g, ' ')}
                                            </span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                {config.environment === 'both' ? 'ALL ENVIRONMENTS' : config.environment}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {/* Health check disabled until API is implemented in next phase */}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setStorageToDelete(config)}
                                        className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--error)] hover:bg-[var(--error-bg)]"
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
                            Deployify automatically injects the appropriate environment variables (like <code className="text-xs bg-[var(--muted)]/20 px-1 rounded">DATABASE_URL</code>) into your services based on these connectors.
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
        </Card>
    );
}
