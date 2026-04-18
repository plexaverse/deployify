'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { cn, getStorageEnvKey } from '@/lib/utils';
import { getRegionalEgressIps } from '@/lib/gcp/networks';
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
    Wrench,
    Search,
    ShieldAlert,
    Network,
    RefreshCw,
    TrendingUp,
    Cpu,
    HardDrive,
    Zap,
    History as HistoryIcon,
    GitBranch,
    Upload,
    CopyPlus,
    Eye,
    ShieldCheck,
    Shield,
    Copy,
    FileCode,
    BookOpen,
    ChevronDown,
    ChevronUp,
    Bell,
    BellOff,
    AlertTriangle,
    Sparkles
} from 'lucide-react';
import { useStore } from '@/store';
import { DataPortabilityModal } from '@/components/DataPortabilityModal';
import { OptimizationModal } from '@/components/OptimizationModal';
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
import type { DiagnosticResult } from '@/lib/gcp/storage-validator';

interface StorageSectionProps {
    projectId: string;
    projectRegion?: string | null;
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
    { value: 'neon', label: 'NEON (POSTGRES)', category: 'EXTERNAL' },
    { value: 'generic', label: 'GENERIC DATABASE', category: 'OTHER' },
] as const;

export function StorageSection({ projectId, projectRegion, onUpdate }: StorageSectionProps) {
    const {
        projectStorageConfigs: storageConfigs,
        isLoadingStorage: isLoading,
        activeMigrations,
        fetchProjectStorage,
        addStorageConfig,
        updateStorageConfig,
        deleteStorageConfig,
        validateStorageConnection,
        syncStorageStatus,
        diagnoseStorageConnection,
        rotateStorageCredentials,
        cloneStorageConfig,
        runProjectMigration,
        runProjectRollback,
        clearMigrationStatus,
        updateStorageAlerts
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
    const [neonProjectId, setNeonProjectId] = useState('');
    const [providerApiKey, setProviderApiKey] = useState('');
    const [secretOnly, setSecretOnly] = useState(false);
    const [region, setRegion] = useState('');
    const [providerProjectId, setProviderProjectId] = useState('');
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
    const [pitrTimestamp, setPitrTimestamp] = useState('');
    const [isManagingMigrations, setIsManagingMigrations] = useState<StorageConfig | null>(null);
    const [migrations, setMigrations] = useState<Migration[]>([]);
    const [isLoadingMigrations, setIsLoadingMigrations] = useState(false);
    const [migrationCommand, setMigrationCommand] = useState('prisma migrate deploy');
    const [rollbackCommand, setRollbackCommand] = useState('prisma migrate resolve --rolled-back');
    const [previewMigration, setPreviewMigration] = useState<{ name: string; content: string; provider?: string } | null>(null);
    const [isFetchingPreview, setIsFetchingPreview] = useState<string | null>(null);
    const [isMigratingRegion, setIsMigratingRegion] = useState<StorageConfig | null>(null);

    const [isManagingAlerts, setIsManagingAlerts] = useState<StorageConfig | null>(null);
    const [isManagingOptimization, setIsManagingOptimization] = useState<StorageConfig | null>(null);
    const [isManagingPortability, setIsManagingPortability] = useState<StorageConfig | null>(null);
    const [isShowingGuide, setIsShowingGuide] = useState<StorageConfig | null>(null);
    const [isTroubleshooting, setIsTroubleshooting] = useState<StorageConfig | null>(null);
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
    const [egressIps, setEgressIps] = useState<{ region: string; ips: string[]; isFallback?: boolean } | null>(null);
    const [highAvailability, setHighAvailability] = useState(false);
    const [pitrEnabled, setPitrEnabled] = useState(false);
    const [deletionProtection, setDeletionProtection] = useState(false);
    const [sslRequired, setSslRequired] = useState(false);
    const [discoveredResources, setDiscoveredResources] = useState<import('@/lib/gcp/discovery').DiscoveredResource[]>([]);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [isReclaiming, setIsReclaiming] = useState<string | null>(null);
    const [alertCpu, setAlertCpu] = useState(80);
    const [alertMemory, setAlertMemory] = useState(80);
    const [alertDisk, setAlertDisk] = useState(80);
    const [alertsEnabled, setAlertsEnabled] = useState(false);
    const [alertEmailEnabled, setAlertEmailEnabled] = useState(false);
    const [autoMigrationEnabled, setAutoMigrationEnabled] = useState(false);
    const [autoMigrationCommand, setAutoMigrationCommand] = useState('prisma migrate deploy');
    const [customRollbackCommand, setCustomRollbackCommand] = useState('prisma migrate resolve --rolled-back');
    const [branchingEnabled, setBranchingEnabled] = useState(false);
    const [branchingTemplate, setBranchingTemplate] = useState('{base}_{identifier}');
    const [seedCommand, setSeedCommand] = useState('');
    const [isCloningId, setIsCloningId] = useState<string | null>(null);
    const [cloneWithData, setCloneWithData] = useState(false);

    useEffect(() => {
        fetchProjectStorage(projectId);
    }, [projectId, fetchProjectStorage]);

    useEffect(() => {
        if (isShowingGuide) {
            setEgressIps(getRegionalEgressIps(projectRegion || isShowingGuide.region || (isShowingGuide.metadata?.region as string)));
        } else {
            setEgressIps(null);
        }
    }, [isShowingGuide, projectRegion]);

    useEffect(() => {
        if (!isAdding && !editingId) return;

        // Auto-set envKey based on type if it's empty
        if (!envKey) {
            setEnvKey(getStorageEnvKey({ type }));
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
                if (type === 'neon') {
                    metadata.neonProjectId = neonProjectId;
                }
            }

            const success = await addStorageConfig(projectId, {
                name,
                type,
                environment,
                envKey,
                region: region || undefined,
                providerProjectId: providerProjectId || undefined,
                branchingSettings: {
                    enabled: branchingEnabled,
                    template: branchingTemplate,
                    seedCommand: seedCommand || undefined
                },
                autoMigration: autoMigrationEnabled,
                migrationCommand: autoMigrationCommand,
                rollbackCommand: customRollbackCommand,
                ssl: sslRequired,
                metadata: {
                    ...metadata,
                    secretOnly,
                    highAvailability: type.includes('cloud-sql') ? highAvailability : undefined,
                    pitrEnabled: type.includes('cloud-sql') ? pitrEnabled : undefined,
                    deletionProtection: type.includes('cloud-sql') ? deletionProtection : undefined,
                    region: region || undefined // Ensure it persists in metadata for backward compatibility
                }
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
        const result = await runProjectMigration(projectId, isManagingMigrations.id, migrationCommand);
        if (result.success) {
            // Trigger sync to show provisioning/busy status if applicable
            await syncStorageStatus(projectId, isManagingMigrations.id);
        }
    };

    const handleRunRollback = async () => {
        if (!isManagingMigrations) return;
        const result = await runProjectRollback(projectId, isManagingMigrations.id, rollbackCommand);
        if (result.success) {
            // Trigger sync to show provisioning/busy status if applicable
            await syncStorageStatus(projectId, isManagingMigrations.id);
        }
    };

    const handlePreviewSQL = async (migration: Migration) => {
        if (!isManagingMigrations) return;
        if (previewMigration?.name === migration.name) {
            setPreviewMigration(null);
            return;
        }

        setIsFetchingPreview(migration.id);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${isManagingMigrations.id}/migrations/content?name=${migration.name}&provider=${migration.provider || 'prisma'}`);
            const data = await response.json();
            if (data.success) {
                setPreviewMigration({
                    name: migration.name,
                    content: data.content,
                    provider: migration.provider
                });
            }
        } catch (e) {
            console.error('Failed to fetch migration content:', e);
        } finally {
            setIsFetchingPreview(null);
        }
    };

    // Watch for active migration completion to refresh the list
    useEffect(() => {
        if (!isManagingMigrations) return;
        const activeMigration = activeMigrations[isManagingMigrations.id];
        if (activeMigration && (activeMigration.status === 'SUCCESS' || activeMigration.status === 'FAILURE')) {
            fetchMigrations(isManagingMigrations.id);
        }
    }, [activeMigrations, isManagingMigrations, fetchMigrations]);

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
                envKey,
                region: region || undefined,
                providerProjectId: providerProjectId || undefined,
                branchingSettings: {
                    enabled: branchingEnabled,
                    template: branchingTemplate,
                    seedCommand: seedCommand || undefined
                },
                autoMigration: autoMigrationEnabled,
                migrationCommand: autoMigrationCommand,
                rollbackCommand: customRollbackCommand,
                ssl: sslRequired,
                metadata: {
                    secretOnly,
                    highAvailability: type.includes('cloud-sql') ? highAvailability : undefined,
                    pitrEnabled: type.includes('cloud-sql') ? pitrEnabled : undefined,
                    deletionProtection: type.includes('cloud-sql') ? deletionProtection : undefined,
                    region: region || undefined
                }
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
        setSecretOnly(false);
        setRegion('');
        setProviderProjectId('');
        setBranchingEnabled(false);
        setBranchingTemplate('{base}_{identifier}');
        setSeedCommand('');
        setAutoMigrationEnabled(false);
        setAutoMigrationCommand('prisma migrate deploy');
        setCustomRollbackCommand('prisma migrate resolve --rolled-back');
        setSslRequired(false);
        setHighAvailability(false);
        setPitrEnabled(false);
        setDeletionProtection(false);
        setProviderApiKey('');
        setSupabaseId('');
        setMongodbGroupId('');
        setMongodbClusterName('');
        setPlanetscaleOrg('');
        setPlanetscaleDb('');
        setNeonProjectId('');
    };

    const startEditing = (config: StorageConfig) => {
        setEditingId(config.id);
        setName(config.name);
        setType(config.type);
        setEnvironment(config.environment);
        setEnvKey(config.envKey || '');
        setSecretOnly(!!config.metadata?.secretOnly);
        setRegion(config.region || (config.metadata?.region as string) || '');
        setProviderProjectId(config.providerProjectId || '');
        setBranchingEnabled(!!config.branchingSettings?.enabled);
        setBranchingTemplate(config.branchingSettings?.template || '{base}_{identifier}');
        setSeedCommand(config.branchingSettings?.seedCommand || '');
        setAutoMigrationEnabled(!!config.autoMigration);
        setAutoMigrationCommand(config.migrationCommand || 'prisma migrate deploy');
        setCustomRollbackCommand(config.rollbackCommand || 'prisma migrate resolve --rolled-back');
        setSslRequired(!!config.ssl);
        setHighAvailability(!!config.metadata?.highAvailability);
        setPitrEnabled(!!config.metadata?.pitrEnabled);
        setDeletionProtection(!!config.metadata?.deletionProtection);
        setNeonProjectId((config.metadata?.neonProjectId as string) || '');
        setSupabaseId((config.metadata?.supabaseId as string) || '');
        setMongodbGroupId((config.metadata?.groupId as string) || '');
        setMongodbClusterName((config.metadata?.clusterName as string) || '');
        setPlanetscaleOrg((config.metadata?.organization as string) || '');
        setPlanetscaleDb((config.metadata?.database as string) || '');
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

    const handleDiscover = async () => {
        setIsDiscovering(true);
        try {
            const res = await fetch(`/api/gcp/discover?projectId=${projectId}${providerProjectId ? `&gcpProjectId=${providerProjectId}` : ''}`);
            const data = await res.json();
            if (data.success) {
                setDiscoveredResources(data.resources);
                if (data.resources.length === 0) {
                    toast.info('No database resources discovered in project');
                } else {
                    toast.success(`Discovered ${data.resources.length} resources`);
                }
            } else {
                toast.error(data.error || 'Failed to discover resources');
            }
        } catch (e) {
            console.error('Discovery failed:', e);
            toast.error('Discovery failed');
        } finally {
            setIsDiscovering(false);
        }
    };

    const handleApplyDiscovery = (resource: import('@/lib/gcp/discovery').DiscoveredResource) => {
        setName(resource.name.toUpperCase());
        setRegion(resource.region);

        if (resource.type === 'cloud-sql') {
            const version = resource.metadata?.databaseVersion as string || '';
            setType(version.includes('MYSQL') ? 'cloud-sql-mysql' : 'cloud-sql-postgres');
        } else if (resource.type === 'memorystore-redis') {
            setType('memorystore-redis');
        } else if (resource.type === 'firestore') {
            setType('firestore');
        }

        setDiscoveredResources([]);
        toast.success(`Applied settings for ${resource.name}`);
    };

    const handleReclaimResource = async (resource: import('@/lib/gcp/discovery').DiscoveredResource) => {
        if (!confirm(`Are you sure you want to RECLAIM ${resource.name}? This will permanently delete the resource from GCP.`)) return;

        setIsReclaiming(resource.id);
        try {
            const res = await fetch(`/api/gcp/discover?projectId=${projectId}&resourceId=${resource.id}&resourceType=${resource.type}&region=${resource.region}${providerProjectId ? `&gcpProjectId=${providerProjectId}` : ''}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                // Refresh discovery list
                handleDiscover();
            } else {
                toast.error(data.error || 'Reclamation failed');
            }
        } catch (e) {
            console.error('Reclaim failed:', e);
            toast.error('Reclaim operation failed');
        } finally {
            setIsReclaiming(null);
        }
    };

    const handlePurgeOrphans = async () => {
        const orphans = discoveredResources.filter(r => r.isOrphaned);
        if (orphans.length === 0) return;

        if (!confirm(`Are you sure you want to PURGE ALL ${orphans.length} orphaned resources? This action is irreversible.`)) return;

        let successCount = 0;
        let failCount = 0;

        for (const resource of orphans) {
            setIsReclaiming(resource.id);
            try {
                const res = await fetch(`/api/gcp/discover?projectId=${projectId}&resourceId=${resource.id}&resourceType=${resource.type}&region=${resource.region}${providerProjectId ? `&gcpProjectId=${providerProjectId}` : ''}`, {
                    method: 'DELETE'
                });
                if (res.ok) successCount++;
                else failCount++;
            } catch {
                failCount++;
            }
        }

        setIsReclaiming(null);
        if (successCount > 0) toast.success(`Successfully reclaimed ${successCount} resources`);
        if (failCount > 0) toast.error(`Failed to reclaim ${failCount} resources`);
        handleDiscover();
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

    const handleUpdateAlerts = async () => {
        if (!isManagingAlerts) return;
        setIsSubmitting(true);
        try {
            const success = await updateStorageAlerts(projectId, isManagingAlerts.id, {
                enabled: alertsEnabled,
                cpuThreshold: alertCpu,
                memoryThreshold: alertMemory,
                diskThreshold: alertDisk,
                emailNotifications: alertEmailEnabled
            });
            if (success) {
                setIsManagingAlerts(null);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDiagnose = async () => {
        if (!isTroubleshooting) return;
        setIsDiagnosing(true);
        setDiagnosticResult(null);
        try {
            const result = await diagnoseStorageConnection(projectId, isTroubleshooting.id);
            if (result.success && result.diagnostic) {
                setDiagnosticResult(result.diagnostic);
            } else {
                toast.error('Diagnostic failed to complete');
            }
        } finally {
            setIsDiagnosing(false);
        }
    };

    const handleMigrateRegion = async () => {
        if (!isMigratingRegion) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${isMigratingRegion.id}/migrate-region`, {
                method: 'POST'
            });
            const data = await response.json();
            if (data.success) {
                setIsMigratingRegion(null);
                await syncStorageStatus(projectId, isMigratingRegion.id);
                toast.success(data.message || 'Regional migration started');
            } else {
                toast.error(data.error || 'Failed to start migration');
            }
        } catch (e) {
            console.error('Migration error:', e);
            toast.error('An error occurred during regional migration');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRestoreBackup = async (backupId: string, pointInTime?: string) => {
        if (!isManagingBackups) return;
        const confirmMsg = pointInTime
            ? `Are you sure you want to restore to ${pointInTime}? This will overwrite current data and the instance will be unavailable during the process.`
            : 'Are you sure you want to restore this backup? This will overwrite current data and the instance will be unavailable during the process.';

        if (!confirm(confirmMsg)) return;

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${isManagingBackups.id}/backups/${backupId}/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pointInTime }),
            });
            const data = await response.json();
            if (data.success) {
                setIsManagingBackups(null);
                setPitrTimestamp('');
                // Trigger sync to show provisioning status
                await syncStorageStatus(projectId, isManagingBackups.id);
                toast.success(pointInTime ? 'PITR restoration started' : 'Backup restoration started');
            } else {
                toast.error(data.error || 'Failed to start restoration');
            }
        } catch (e) {
            console.error('Failed to restore backup:', e);
            toast.error('An error occurred during restoration');
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
                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Infrastructure</span>
                        <h3 className="text-[10px] font-bold">Storage & Databases</h3>
                    </div>
                </div>
                {!isAdding && (
                    <MovingBorderButton
                        onClick={() => setIsAdding(true)}
                        containerClassName="h-10 w-44"
                        className="text-[8px] font-bold uppercase tracking-wider"
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold">Connector Name</Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="E.G. PRIMARY POSTGRES"
                                    className="placeholder:text-[8px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold flex items-center justify-between">
                                    External GCP Project ID (Optional)
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleDiscover}
                                        disabled={isDiscovering}
                                        className="h-5 px-1.5 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                    >
                                        {isDiscovering ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
                                        Scan Project
                                    </Button>
                                </Label>
                                <Input
                                    value={providerProjectId}
                                    onChange={(e) => setProviderProjectId(e.target.value)}
                                    placeholder="E.G. MY-OTHER-PROJECT"
                                    className="placeholder:text-[8px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold">GCP Region (Optional)</Label>
                                <Input
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                    placeholder="E.G. US-CENTRAL1"
                                    className="placeholder:text-[8px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold">Database Type</Label>
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

                        {discoveredResources.length > 0 && (
                            <div className="p-4 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-lg space-y-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center justify-between border-b border-[var(--primary)]/10 pb-2">
                                    <div className="flex items-center gap-4">
                                        <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Infrastructure Health</Label>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[8px] font-bold text-[var(--success)]">{discoveredResources.filter(r => !r.isOrphaned).length} ACTIVE</span>
                                            <span className="text-[8px] font-bold text-[var(--error)]">{discoveredResources.filter(r => r.isOrphaned).length} ORPHANED</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {discoveredResources.some(r => r.isOrphaned) && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handlePurgeOrphans}
                                                disabled={isReclaiming !== null}
                                                className="h-5 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--error)] hover:bg-[var(--error)]/10"
                                            >
                                                Purge All Orphans
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="sm" onClick={() => setDiscoveredResources([])} className="h-5 text-[8px] font-bold uppercase">Clear</Button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {discoveredResources.map((res) => (
                                        <div
                                            key={res.id}
                                            className={cn(
                                                "flex flex-col items-start p-2 text-left border rounded-md bg-[var(--background)] transition-colors group relative",
                                                res.isOrphaned ? "border-[var(--error)]/30" : "border-[var(--border)] hover:border-[var(--primary)]"
                                            )}
                                        >
                                            <button
                                                onClick={() => handleApplyDiscovery(res)}
                                                className="w-full flex flex-col items-start text-left"
                                            >
                                                <div className="flex items-center justify-between w-full gap-2">
                                                    <span className="text-[8px] font-bold uppercase truncate pr-6">{res.name}</span>
                                                    {res.isOrphaned && (
                                                        <span className="text-[8px] px-1 rounded bg-[var(--error)]/10 text-[var(--error)] font-bold uppercase shrink-0">Orphaned</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] px-1 bg-[var(--muted)]/20 rounded">{res.type.replace(/-/g, ' ')}</span>
                                                    <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">{res.region}</span>
                                                </div>
                                            </button>

                                            {res.isOrphaned && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleReclaimResource(res);
                                                    }}
                                                    disabled={isReclaiming === res.id}
                                                    className="absolute top-1 right-1 h-6 w-6 text-[var(--error)] hover:bg-[var(--error)]/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Reclaim Resource"
                                                >
                                                    {isReclaiming === res.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!editingId && (
                            <div className="space-y-2">
                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Setup Method</Label>
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
                                    <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                        <div className="space-y-0.5">
                                            <Label className="text-[10px] font-bold">Secret Only Mode</Label>
                                            <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Store in Secret Manager without auto-injection</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={secretOnly}
                                            onChange={(e) => setSecretOnly(e.target.checked)}
                                            className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold">Connection String / Secret</Label>
                                    <Input
                                        type="password"
                                        value={connectionString}
                                        onChange={(e) => setConnectionString(e.target.value)}
                                        placeholder={editingId ? "LEAVE BLANK TO KEEP CURRENT SECRET" : "POSTGRESQL://USER:PASSWORD@HOST:PORT/DB"}
                                        className="font-mono text-[10px] placeholder:text-[8px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                    />
                                        <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            Stored securely in Google Cloud Secret Manager.
                                        </p>
                                    </div>
                                    {(type === 'supabase' || type === 'mongodb-atlas' || type === 'planetscale' || type === 'neon') && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                                <div className="space-y-0.5">
                                                    <Label className="text-[10px] font-bold">SSL Required</Label>
                                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Enforce encrypted connections</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={sslRequired}
                                                    onChange={(e) => setSslRequired(e.target.checked)}
                                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                                />
                                            </div>

                                            {!editingId && (
                                                <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                                    <div className="space-y-0.5">
                                                        <Label className="text-[10px] font-bold">API Auto-Sync</Label>
                                                        <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Sync credentials via provider API</p>
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        checked={autoSync}
                                                        onChange={(e) => setAutoSync(e.target.checked)}
                                                        className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                                    />
                                                </div>
                                            )}

                                            {autoSync && (
                                                <div className="p-4 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-lg space-y-4 animate-in slide-in-from-top-2">
                                                    <div className="space-y-2">
                                                        <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Provider API Key</Label>
                                                        <Input
                                                            type="password"
                                                            value={providerApiKey}
                                                            onChange={(e) => setProviderApiKey(e.target.value)}
                                                            placeholder="ENTER PROVIDER API KEY..."
                                                            className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                        />
                                                    </div>

                                                    {type === 'supabase' && (
                                                        <div className="space-y-2">
                                                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Supabase Project ID</Label>
                                                            <Input
                                                                value={supabaseId}
                                                                onChange={(e) => setSupabaseId(e.target.value)}
                                                                placeholder="E.G. ABCDEFGHIJKLMNOP"
                                                                className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                            />
                                                        </div>
                                                    )}

                                                    {type === 'mongodb-atlas' && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Group ID</Label>
                                                                <Input
                                                                    value={mongodbGroupId}
                                                                    onChange={(e) => setMongodbGroupId(e.target.value)}
                                                                    placeholder="ATLAS GROUP ID"
                                                                    className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Cluster Name</Label>
                                                                <Input
                                                                    value={mongodbClusterName}
                                                                    onChange={(e) => setMongodbClusterName(e.target.value)}
                                                                    placeholder="CLUSTER0"
                                                                    className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {type === 'planetscale' && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Organization</Label>
                                                                <Input
                                                                    value={planetscaleOrg}
                                                                    onChange={(e) => setPlanetscaleOrg(e.target.value)}
                                                                    placeholder="ORG NAME"
                                                                    className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Database</Label>
                                                                <Input
                                                                    value={planetscaleDb}
                                                                    onChange={(e) => setPlanetscaleDb(e.target.value)}
                                                                    placeholder="DB NAME"
                                                                    className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {type === 'neon' && (
                                                        <div className="space-y-2">
                                                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Neon Project ID</Label>
                                                            <Input
                                                                value={neonProjectId}
                                                                onChange={(e) => setNeonProjectId(e.target.value)}
                                                                placeholder="E.G. EP-MOCK-123456"
                                                                className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-lg flex items-start gap-3">
                                        <Activity className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                                        <div className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                            Deployify will automatically provision a new <strong>{type.replace(/-/g, ' ')}</strong> instance in your project&apos;s default region and manage all credentials.
                                        </div>
                                    </div>

                                    {type.includes('cloud-sql') && (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                                <div className="space-y-0.5">
                                                    <Label className="text-[8px] font-bold uppercase tracking-wider">High Availability</Label>
                                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Multi-zone redundancy</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={highAvailability}
                                                    onChange={(e) => setHighAvailability(e.target.checked)}
                                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                                <div className="space-y-0.5">
                                                    <Label className="text-[8px] font-bold uppercase tracking-wider">PITR Recovery</Label>
                                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Point-in-time snapshots</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={pitrEnabled}
                                                    onChange={(e) => setPitrEnabled(e.target.checked)}
                                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                                <div className="space-y-0.5">
                                                    <Label className="text-[8px] font-bold uppercase tracking-wider">Deletion Protection</Label>
                                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Prevent accidental delete</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={deletionProtection}
                                                    onChange={(e) => setDeletionProtection(e.target.checked)}
                                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                                    <div className={cn("space-y-6 transition-opacity", secretOnly && "opacity-40 pointer-events-none")}>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold">Environment Variable Key</Label>
                                            <Input
                                    value={envKey}
                                    onChange={(e) => setEnvKey(e.target.value)}
                                    placeholder="DATABASE_URL"
                                    disabled={secretOnly}
                                    className="font-mono text-[10px] placeholder:text-[8px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                                            <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                {secretOnly ? "Auto-injection is disabled in Secret Only mode." : "This key will be injected into your application at runtime."}
                                            </p>
                                        </div>

                                        <div className="space-y-4 pt-2">
                                            <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                                <div className="space-y-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <Label className="text-[10px] font-bold">Preview Branching</Label>
                                                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)] font-bold uppercase tracking-wider border border-[var(--primary)]/20">BETA</span>
                                                    </div>
                                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Isolated database for Preview Deployments</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={branchingEnabled}
                                                    onChange={(e) => setBranchingEnabled(e.target.checked)}
                                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                                />
                                            </div>

                                            {branchingEnabled && (
                                                <div className="p-4 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-lg space-y-4 animate-in slide-in-from-top-2">
                                                    <div className="space-y-2">
                                                        <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Database Name Template</Label>
                                                        <Input
                                                            value={branchingTemplate}
                                                            onChange={(e) => setBranchingTemplate(e.target.value)}
                                                            placeholder="{base}_{identifier}"
                                                            className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                        />
                                                        <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/70">
                                                            USE <code className="text-[var(--primary)]">{'{base}'}</code> FOR ORIGINAL NAME AND <code className="text-[var(--primary)]">{'{identifier}'}</code> FOR BRANCH/PR NAME.
                                                        </p>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Seed Command (Optional)</Label>
                                                        <Input
                                                            value={seedCommand}
                                                            onChange={(e) => setSeedCommand(e.target.value)}
                                                            placeholder="E.G. NPX PRISMA DB SEED"
                                                            className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                        />
                                                        <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/70">
                                                            EXPORTS <code className="text-[var(--primary)]">$DATABASE_URL</code> (OR CUSTOM KEY) TO THE BUILD ENVIRONMENT.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {(type.includes('sql') || type === 'planetscale' || type === 'supabase' || type === 'neon' || type === 'memorystore-redis') && (
                                            <div className="space-y-4 pt-2 border-t border-[var(--border)] mt-4">
                                                <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-lg bg-[var(--muted)]/5">
                                                    <div className="space-y-0.5">
                                                        <Label className="text-[10px] font-bold">Automated Migrations</Label>
                                                        <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Run migrations automatically during deployment</p>
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        checked={autoMigrationEnabled}
                                                        onChange={(e) => setAutoMigrationEnabled(e.target.checked)}
                                                        className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                                    />
                                                </div>

                                                {autoMigrationEnabled && (
                                                    <div className="p-4 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-lg space-y-4 animate-in slide-in-from-top-2">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Migration Command</Label>
                                                                <Input
                                                                    value={autoMigrationCommand}
                                                                    onChange={(e) => setAutoMigrationCommand(e.target.value)}
                                                                    placeholder="E.G. PRISMA MIGRATE DEPLOY"
                                                                    className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Rollback Command</Label>
                                                                <Input
                                                                    value={customRollbackCommand}
                                                                    onChange={(e) => setCustomRollbackCommand(e.target.value)}
                                                                    placeholder="E.G. PRISMA MIGRATE RESOLVE --ROLLED-BACK"
                                                                    className="h-8 text-[8px] font-mono placeholder:text-[8px]"
                                                                />
                                                            </div>
                                                        </div>
                                                        <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]/70">
                                                            MIGRATION EXECUTED AFTER BUILD. ROLLBACK IS TRIGGERED MANUALLY FROM THE DASHBOARD.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Environment Scope</Label>
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
                                className="text-[8px] font-bold uppercase tracking-wider"
                            >
                                Cancel
                            </Button>
                            <MovingBorderButton
                                onClick={editingId ? handleUpdate : handleAdd}
                                disabled={isSubmitting || !name}
                                loading={isSubmitting}
                                containerClassName="h-10 w-44"
                                className="text-[8px] font-bold uppercase tracking-wider"
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
                                            <h4 className="font-bold text-[10px]">{config.name}</h4>
                                        {config.region && projectRegion && config.region !== projectRegion && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (config.type.includes('cloud-sql')) {
                                                        setIsMigratingRegion(config);
                                                    }
                                                }}
                                                className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--error)]/10 text-[var(--error)] font-bold uppercase tracking-wider border border-[var(--error)]/20 flex items-center gap-1 hover:bg-[var(--error)]/20 transition-colors"
                                                title={config.type.includes('cloud-sql') ? `Service is in ${projectRegion} while storage is in ${config.region}. Click to migrate instance.` : `Service is in ${projectRegion} while storage is in ${config.region}. Higher latency expected.`}
                                            >
                                                <AlertTriangle className="w-2.5 h-2.5" />
                                                REGION MISMATCH
                                            </button>
                                        )}
                                            {config.connectionStringSecretId && !config.metadata?.secretOnly && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--success)]/10 text-[var(--success)] font-bold uppercase tracking-wider border border-[var(--success)]/20 flex items-center gap-1" title="Natively mounted from Secret Manager">
                                                    <ShieldCheck className="w-2.5 h-2.5" />
                                                    SECURELY MOUNTED
                                                </span>
                                            )}
                                            {config.connectionStringSecretId && !!config.metadata?.secretOnly && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--muted)]/20 text-[var(--muted-foreground)] font-bold uppercase tracking-wider border border-[var(--border)] flex items-center gap-1" title="Stored in Secret Manager but not injected">
                                                    <Shield className="w-2.5 h-2.5" />
                                                    SECRET ONLY
                                                </span>
                                            )}
                                            {config.ssl && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--info)]/10 text-[var(--info)] font-bold uppercase tracking-wider border border-[var(--info)]/20 flex items-center gap-1" title="Encrypted connection enforced">
                                                    <ShieldCheck className="w-2.5 h-2.5" />
                                                    SSL
                                                </span>
                                            )}
                                            {!!config.metadata?.firewallSynced && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--success)]/10 text-[var(--success)] font-bold uppercase tracking-wider border border-[var(--success)]/20 flex items-center gap-1" title={`Regional egress IPs allowed in provider firewall. Last sync: ${config.metadata.lastFirewallSyncAt ? new Date(config.metadata.lastFirewallSyncAt as string).toLocaleString() : 'N/A'}`}>
                                                    <Network className="w-2.5 h-2.5" />
                                                    FIREWALL SYNCED
                                                </span>
                                            )}
                                            {config.type.includes('cloud-sql') && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-bold uppercase tracking-wider border border-[var(--primary)]/20 flex items-center gap-1">
                                                    <Zap className="w-2.5 h-2.5" />
                                                    IAM AUTH
                                                </span>
                                            )}
                                            {config.branchingSettings?.enabled && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--info)]/10 text-[var(--info)] font-bold uppercase tracking-wider border border-[var(--info)]/20 flex items-center gap-1" title={`Branching template: ${config.branchingSettings.template}`}>
                                                    <GitBranch className="w-2.5 h-2.5" />
                                                    BRANCHING ACTIVE
                                                </span>
                                            )}
                                            {config.autoMigration && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--success)]/10 text-[var(--success)] font-bold uppercase tracking-wider border border-[var(--success)]/20 flex items-center gap-1" title={`Auto-migration command: ${config.migrationCommand}`}>
                                                    <RefreshCw className="w-2.5 h-2.5" />
                                                    AUTO-MIGRATE
                                                </span>
                                            )}
                                            {!!config.metadata?.optimization && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-bold uppercase tracking-wider border border-[var(--primary)]/20 flex items-center gap-1 animate-pulse">
                                                    <Sparkles className="w-2.5 h-2.5" />
                                                    OPTIMIZATION AVAILABLE
                                                </span>
                                            )}
                                            {!!config.metadata?.highAvailability && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--warning)]/10 text-[var(--warning)] font-bold uppercase tracking-wider border border-[var(--warning)]/20 flex items-center gap-1" title="Multi-zone redundancy enabled">
                                                    <Zap className="w-2.5 h-2.5" />
                                                    HA ENABLED
                                                </span>
                                            )}
                                            {!!config.metadata?.pitrEnabled && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-bold uppercase tracking-wider border border-[var(--primary)]/20 flex items-center gap-1" title="Point-in-time recovery active">
                                                    <HistoryIcon className="w-2.5 h-2.5" />
                                                    PITR ACTIVE
                                                </span>
                                            )}
                                            {!!config.metadata?.deletionProtection && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--info)]/10 text-[var(--info)] font-bold uppercase tracking-wider border border-[var(--info)]/20 flex items-center gap-1" title="Deletion protection enabled">
                                                    <ShieldCheck className="w-2.5 h-2.5" />
                                                    PROTECTED
                                                </span>
                                            )}
                                            {config.activeAlerts && config.activeAlerts.length > 0 && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-[var(--error)]/10 text-[var(--error)] font-bold uppercase tracking-wider border border-[var(--error)]/20 flex items-center gap-1" title={config.activeAlerts.join('\n')}>
                                                    <AlertTriangle className="w-2.5 h-2.5" />
                                                    {config.activeAlerts.length} ALERT{config.activeAlerts.length > 1 ? 'S' : ''}
                                                </span>
                                            )}
                                            {getStatusIcon(config.status, config.id)}
                                            {config.status === 'error' && config.lastError && (
                                                <span className="text-[8px] font-bold text-[var(--error)] uppercase truncate max-w-[200px]" title={config.lastError}>
                                                    — {config.lastError}
                                                </span>
                                            )}
                                            {config.status === 'active' && !!config.metadata?.health && (
                                                <span className={cn(
                                                    "text-[8px] font-bold uppercase flex items-center gap-1",
                                                    (config.metadata.health as { status: string }).status === 'healthy' ? "text-[var(--success)]" :
                                                    (config.metadata.health as { status: string }).status === 'degraded' ? "text-[var(--warning)]" : "text-[var(--error)]"
                                                )}>
                                                    — {(config.metadata.health as { status: string }).status}
                                                    {((config.metadata.health as { status: string }).status === 'healthy' || (config.metadata.health as { status: string }).status === 'degraded') && (
                                                        <span className="text-[8px] font-mono opacity-60">
                                                            ({(config.metadata.health as { latency: number }).latency}ms
                                                            {(config.metadata.health as { baselineLatency: number }).baselineLatency && ` / BASE: ${(config.metadata.health as { baselineLatency: number }).baselineLatency}ms`}
                                                            )
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--muted)]/10 px-2 py-0.5 rounded-full border border-[var(--border)]">
                                                    {config.type.replace(/-/g, ' ')}
                                                </span>
                                                {!config.metadata?.secretOnly && (
                                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                        {getStorageEnvKey(config)}
                                                    </span>
                                                )}
                                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                    {config.environment === 'both' ? 'ALL ENVIRONMENTS' : config.environment}
                                                </span>
                                                {(config.region || (config.metadata?.region as string)) && (
                                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                        {(config.region || (config.metadata?.region as string)).toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {config.lastSyncedAt && (
                                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--success)]">
                                                        SYNCED: {new Date(config.lastSyncedAt).toLocaleTimeString()}
                                                    </span>
                                                )}
                                                {config.lastRotatedAt && (
                                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">
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
                                                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">CPU</span>
                                                        </div>
                                                        <span className="text-[8px] font-mono font-bold text-[var(--primary)]">{metrics[config.id]?.cpuUtilization || 0}%</span>
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
                                                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Memory</span>
                                                        </div>
                                                        <span className="text-[8px] font-mono font-bold text-[var(--success)]">{metrics[config.id]?.memoryUtilization || 0}%</span>
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
                                                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Disk</span>
                                                            </div>
                                                            <span className="text-[8px] font-mono font-bold text-[var(--warning)]">{metrics[config.id]?.diskUtilization}%</span>
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
                                                    <Label className="text-[8px] font-bold uppercase tracking-wider">New Connection String</Label>
                                                    <Input
                                                        type="password"
                                                        value={rotateConnectionString}
                                                        onChange={(e) => setRotateConnectionString(e.target.value)}
                                                        placeholder="PASTE NEW CONNECTION STRING..."
                                                        className="font-mono text-[8px] h-8 placeholder:text-[8px]"
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
                                                        className="h-7 text-[8px] font-bold uppercase tracking-wider"
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleRotate(config.id)}
                                                        disabled={isSubmitting || !rotateConnectionString}
                                                        className="h-7 text-[8px] font-bold uppercase tracking-wider bg-[var(--primary)]"
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
                                    {config.status === 'active' && (config.type.includes('sql') || config.type === 'planetscale' || config.type === 'neon') && (
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
                                    {config.status === 'active' && (config.type.includes('sql') || config.type === 'firestore' || config.type === 'memorystore-redis') && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setIsManagingPortability(config)}
                                            className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                            title="Import / Export Data"
                                        >
                                            <Upload className="w-4 h-4" />
                                        </Button>
                                    )}
                                    {config.status === 'active' && !!config.metadata?.optimization && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setIsManagingOptimization(config)}
                                            className="h-8 w-8 text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                            title="View Optimization Insights"
                                        >
                                            <Sparkles className="w-4 h-4 animate-pulse" />
                                        </Button>
                                    )}
                                    {config.status === 'active' && !!config.metadata?.provisioned && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                setIsManagingAlerts(config);
                                                setAlertsEnabled(config.alertSettings?.enabled || false);
                                                setAlertCpu(config.alertSettings?.cpuThreshold || 80);
                                                setAlertMemory(config.alertSettings?.memoryThreshold || 80);
                                                setAlertDisk(config.alertSettings?.diskThreshold || 80);
                                                setAlertEmailEnabled(config.alertSettings?.emailNotifications || false);
                                            }}
                                            className={cn(
                                                "h-8 w-8",
                                                config.alertSettings?.enabled ? "text-[var(--primary)] hover:bg-[var(--primary)]/10" : "text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                            )}
                                            title="Manage Alerts"
                                        >
                                            {config.alertSettings?.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            setIsCloningId(config.id);
                                            setCloneWithData(false);
                                        }}
                                        className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                        title="Duplicate Connector"
                                    >
                                        <CopyPlus className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            const envKey = getStorageEnvKey(config);
                                            const snippet = `${envKey}="PASTE_YOUR_CONNECTION_STRING_HERE"`;
                                            navigator.clipboard.writeText(snippet);
                                            toast.success(`Config snippet copied: ${envKey}`);
                                        }}
                                        className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                        title="Copy .env Snippet"
                                    >
                                        <FileCode className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setIsShowingGuide(config)}
                                        className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                        title="Usage Guide"
                                    >
                                        <BookOpen className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setIsTroubleshooting(config)}
                                        className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                        title="Troubleshoot Connection"
                                    >
                                        <Wrench className="w-4 h-4" />
                                    </Button>
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
                    <div className="text-[10px]">
                        <p className="font-bold text-[var(--info)] mb-1">Managed Connectivity</p>
                        <p className="text-[var(--muted-foreground)] leading-relaxed">
                            Deployify automatically injects the appropriate environment variables (like <code className="text-[8px] font-bold uppercase tracking-wider bg-[var(--muted)]/20 px-1 rounded">DATABASE_URL</code>) into your services based on these connectors.
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
                        <p className="text-[10px]">
                            Adjust the resource allocation for <strong>{isScaling?.name}</strong>. This update will trigger a GCP operation and the instance status will show as provisioning while the scaling is in progress.
                        </p>

                        {isScaling?.type.includes('cloud-sql') ? (
                            <div className="space-y-2">
                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Machine Tier</Label>
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
                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Memory Capacity (GB)</Label>
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
                                    <span className="text-[10px] font-mono font-bold w-12 text-center">{scaleSizeGb} GB</span>
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
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Trigger Manual Backup</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={backupDescription}
                                    onChange={(e) => setBackupDescription(e.target.value)}
                                    placeholder="BACKUP DESCRIPTION..."
                                    className="h-9 text-[8px] font-bold uppercase placeholder:text-[8px]"
                                />
                                <Button
                                    onClick={handleCreateBackup}
                                    disabled={isSubmitting}
                                    className="h-9 px-4 text-[8px] font-bold uppercase bg-[var(--primary)]"
                                >
                                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                                    Create
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Backup History</Label>
                                {!!isManagingBackups?.metadata?.pitrEnabled && (
                                    <span className="text-[8px] font-bold uppercase text-[var(--primary)] flex items-center gap-1">
                                        <HistoryIcon className="w-3 h-3" />
                                        PITR ACTIVE
                                    </span>
                                )}
                            </div>

                            {!!isManagingBackups?.metadata?.pitrEnabled && (
                                <div className="p-3 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-xl space-y-3 mb-4">
                                    <div className="flex items-center gap-2">
                                        <Zap className="w-3.5 h-3.5 text-[var(--primary)]" />
                                        <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Point-in-Time Recovery</Label>
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            type="datetime-local"
                                            value={pitrTimestamp}
                                            onChange={(e) => setPitrTimestamp(e.target.value)}
                                            className="h-8 text-[8px] font-bold uppercase"
                                        />
                                        <Button
                                            onClick={() => {
                                                try {
                                                    const timestamp = new Date(pitrTimestamp).toISOString();
                                                    handleRestoreBackup('pitr', timestamp);
                                                } catch {
                                                    toast.error('Invalid timestamp provided');
                                                }
                                            }}
                                            disabled={isSubmitting || !pitrTimestamp}
                                            className="h-8 px-3 text-[8px] font-bold uppercase bg-[var(--primary)]"
                                        >
                                            Restore
                                        </Button>
                                    </div>
                                    <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]/60">
                                        RESTORE INSTANCE TO ANY SPECIFIC SECOND WITHIN THE LAST 7 DAYS.
                                    </p>
                                </div>
                            )}

                            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {isLoadingBackups ? (
                                    <div className="py-8 flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Fetching backups...</span>
                                    </div>
                                ) : backups.length === 0 ? (
                                    <div className="py-8 text-center border border-dashed border-[var(--border)] rounded-xl bg-[var(--muted)]/5">
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">No backups found</span>
                                    </div>
                                ) : (
                                    backups.map(b => (
                                        <div key={b.id} className="p-3 border border-[var(--border)] rounded-xl bg-[var(--background)] flex items-center justify-between group">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded",
                                                        b.status === 'SUCCESSFUL' ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--error)]/10 text-[var(--error)]"
                                                    )}>
                                                        {b.status}
                                                    </span>
                                                    <span className="text-[8px] font-mono font-bold">{b.id}</span>
                                                </div>
                                                <p className="text-[8px] font-bold uppercase text-[var(--foreground)]">{b.description || 'AUTOMATED BACKUP'}</p>
                                                <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]/60">{new Date(b.startTime).toLocaleString()}</p>
                                            </div>
                                            {b.status === 'SUCCESSFUL' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleRestoreBackup(b.id)}
                                                    disabled={isSubmitting}
                                                    className="h-7 text-[8px] font-bold uppercase tracking-wider border-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/10 opacity-0 group-hover:opacity-100 transition-opacity"
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
                    setPreviewMigration(null);
                }}
                title="Database Migration Management"
                description={
                    <div className="space-y-6">
                        {isManagingMigrations && activeMigrations[isManagingMigrations.id] ? (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-2 h-2 rounded-full animate-pulse",
                                            activeMigrations[isManagingMigrations.id].status === 'SUCCESS' ? "bg-[var(--success)]" :
                                            activeMigrations[isManagingMigrations.id].status === 'FAILURE' ? "bg-[var(--error)]" :
                                            "bg-[var(--primary)]"
                                        )} />
                                        <span className="text-[8px] font-bold uppercase tracking-wider">
                                            Migration Status: {activeMigrations[isManagingMigrations.id].status}
                                        </span>
                                    </div>
                                    {(activeMigrations[isManagingMigrations.id].status === 'QUEUED' || activeMigrations[isManagingMigrations.id].status === 'WORKING') && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />}
                                </div>

                                <div className="p-4 bg-black/40 border border-[var(--border)] rounded-lg font-mono text-[8px] overflow-hidden">
                                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border)]">
                                        <span className="text-[var(--muted-foreground)] uppercase">Build Logs</span>
                                        <span className="text-[var(--primary)]">{activeMigrations[isManagingMigrations.id].operationName?.split('/').pop()?.substring(0, 8)}</span>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                                        {(activeMigrations[isManagingMigrations.id].logs || '').split('\n').map((line, i) => (
                                            <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
                                                <span className="text-[var(--muted-foreground)] mr-2 opacity-30">{(i + 1).toString().padStart(3, '0')}</span>
                                                <span className={cn(
                                                    line.toLowerCase().includes('error') ? "text-[var(--error)]" :
                                                    line.toLowerCase().includes('success') ? "text-[var(--success)]" :
                                                    "text-[var(--foreground)]/80"
                                                )}>{line}</span>
                                            </div>
                                        ))}
                                        {(activeMigrations[isManagingMigrations.id].status === 'QUEUED' || activeMigrations[isManagingMigrations.id].status === 'WORKING') && (
                                            <div className="flex items-center gap-2 text-[var(--primary)] animate-pulse mt-2">
                                                <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full" />
                                                <span>Awaiting output...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {activeMigrations[isManagingMigrations.id].error && (
                                    <div className="p-3 bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-lg flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-[var(--error)] shrink-0 mt-0.5" />
                                        <p className="text-[8px] font-bold uppercase text-[var(--error)]">{activeMigrations[isManagingMigrations.id].error}</p>
                                    </div>
                                )}

                                {(activeMigrations[isManagingMigrations.id].status === 'SUCCESS' || activeMigrations[isManagingMigrations.id].status === 'FAILURE') && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => clearMigrationStatus(isManagingMigrations.id)}
                                        className="w-full text-[8px] font-bold uppercase tracking-wider"
                                    >
                                        Run Another Migration
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="p-4 border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-xl space-y-4 animate-in fade-in">
                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Run Manual Migration</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={migrationCommand}
                                        onChange={(e) => setMigrationCommand(e.target.value)}
                                        placeholder="E.G. prisma migrate deploy"
                                        className="h-9 text-[8px] font-mono font-bold placeholder:text-[8px]"
                                    />
                                    <Button
                                        onClick={handleRunMigration}
                                        disabled={isLoading}
                                        className="h-9 px-4 text-[8px] font-bold uppercase bg-[var(--primary)]"
                                    >
                                        Run
                                    </Button>
                                </div>
                                <div className="pt-2 border-t border-[var(--border)]">
                                    <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--error)]">Danger: Rollback Operation</Label>
                                    <div className="flex gap-2 mt-2">
                                        <Input
                                            value={rollbackCommand}
                                            onChange={(e) => setRollbackCommand(e.target.value)}
                                            placeholder="E.G. prisma migrate resolve --rolled-back"
                                            className="h-9 text-[8px] font-mono font-bold placeholder:text-[8px] border-[var(--error)]/30"
                                        />
                                        <Button
                                            onClick={handleRunRollback}
                                            disabled={isLoading}
                                            variant="outline"
                                            className="h-9 px-4 text-[8px] font-bold uppercase border-[var(--error)]/30 text-[var(--error)] hover:bg-[var(--error)]/10"
                                        >
                                            Rollback
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">
                                    Trigger migration or rollback operations. Rollbacks should be used with caution as they may cause data loss depending on the command.
                                </p>
                            </div>
                        )}

                        <div className="space-y-3">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Migration History</Label>
                            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {isLoadingMigrations ? (
                                    <div className="py-8 flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Fetching migrations...</span>
                                    </div>
                                ) : migrations.length === 0 ? (
                                    <div className="py-8 text-center border border-dashed border-[var(--border)] rounded-xl bg-[var(--muted)]/5">
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">No migration history found</span>
                                    </div>
                                ) : (
                                    migrations.map(m => (
                                        <div key={m.id} className="space-y-3">
                                            <div className={cn(
                                                "p-3 border rounded-xl flex items-center justify-between group transition-all",
                                                m.status === 'PENDING' ? "border-dashed border-[var(--primary)]/40 bg-[var(--primary)]/5" : "border-[var(--border)] bg-[var(--background)]"
                                            )}>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                            "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded",
                                                            m.status === 'SUCCESS' ? "bg-[var(--success)]/10 text-[var(--success)]" :
                                                            m.status === 'PENDING' ? "bg-[var(--primary)]/10 text-[var(--primary)]" :
                                                            "bg-[var(--error)]/10 text-[var(--error)]"
                                                        )}>
                                                            {m.status}
                                                        </span>
                                                        {m.drifted && (
                                                            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--error)]/20 text-[var(--error)] animate-pulse border border-[var(--error)]/30">
                                                                DRIFTED
                                                            </span>
                                                        )}
                                                        <span className="text-[8px] font-mono font-bold text-[var(--muted-foreground)]">{m.provider?.toUpperCase()}</span>
                                                    </div>
                                                    <p className="text-[8px] font-bold uppercase text-[var(--foreground)] truncate max-w-[280px]" title={m.name}>{m.name}</p>
                                                    <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]/60">
                                                        {m.appliedAt ? new Date(m.appliedAt).toLocaleString() : 'PENDING APPLICATION'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handlePreviewSQL(m)}
                                                        disabled={isFetchingPreview === m.id}
                                                        className={cn(
                                                            "h-8 px-2 text-[8px] font-bold uppercase tracking-wider transition-colors",
                                                            previewMigration?.name === m.name ? "text-[var(--primary)] bg-[var(--primary)]/10" : "text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                                        )}
                                                    >
                                                        {isFetchingPreview === m.id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <Eye className="w-3.5 h-3.5 mr-1.5" />
                                                                Preview
                                                                {previewMigration?.name === m.name ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                            {previewMigration?.name === m.name && (
                                                <div className="p-4 bg-black/40 border border-[var(--primary)]/20 rounded-xl font-mono text-[8px] animate-in slide-in-from-top-2 fade-in">
                                                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border)]">
                                                        <span className="text-[var(--muted-foreground)] uppercase">Migration Source: {m.name}</span>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(previewMigration.content);
                                                                toast.success('SQL copied to clipboard');
                                                            }}
                                                            title="Copy to clipboard"
                                                        >
                                                            <Copy className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                    <div className="max-h-40 overflow-y-auto custom-scrollbar">
                                                        <pre className="whitespace-pre-wrap break-all text-[var(--foreground)]/80 leading-relaxed">
                                                            {previewMigration.content}
                                                        </pre>
                                                    </div>
                                                </div>
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
                isOpen={!!isManagingAlerts}
                onClose={() => setIsManagingAlerts(null)}
                onConfirm={handleUpdateAlerts}
                title="Resource Monitoring Alerts"
                description={
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 border border-[var(--border)] rounded-xl bg-[var(--muted)]/5">
                            <div className="space-y-0.5">
                                <Label className="text-[10px] font-bold">Enable Automated Alerts</Label>
                                <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Notify when resource usage exceeds thresholds</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={alertsEnabled}
                                onChange={(e) => setAlertsEnabled(e.target.checked)}
                                className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                            />
                        </div>

                        <div className={cn("space-y-6 transition-opacity", !alertsEnabled && "opacity-40 pointer-events-none")}>
                            <div className="flex items-center justify-between p-4 border border-[var(--border)] rounded-xl bg-[var(--muted)]/5">
                                <div className="space-y-0.5">
                                    <Label className="text-[10px] font-bold">Email Notifications</Label>
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Send alerts to your account email address</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={alertEmailEnabled}
                                    onChange={(e) => setAlertEmailEnabled(e.target.checked)}
                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">CPU Threshold</Label>
                                    <span className="text-[8px] font-mono font-bold text-[var(--primary)]">{alertCpu}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="100"
                                    value={alertCpu}
                                    onChange={(e) => setAlertCpu(parseInt(e.target.value))}
                                    className="w-full accent-[var(--primary)]"
                                />
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Memory Threshold</Label>
                                    <span className="text-[8px] font-mono font-bold text-[var(--success)]">{alertMemory}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="100"
                                    value={alertMemory}
                                    onChange={(e) => setAlertMemory(parseInt(e.target.value))}
                                    className="w-full accent-[var(--success)]"
                                />
                            </div>

                            {isManagingAlerts?.type.includes('cloud-sql') && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Disk Threshold</Label>
                                        <span className="text-[8px] font-mono font-bold text-[var(--warning)]">{alertDisk}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="1"
                                        max="100"
                                        value={alertDisk}
                                        onChange={(e) => setAlertDisk(parseInt(e.target.value))}
                                        className="w-full accent-[var(--warning)]"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl flex items-start gap-3">
                            <Activity className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                            <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-relaxed">
                                Alerts are checked automatically during connector synchronization. When a threshold is breached, a warning indicator will appear next to the connector.
                            </p>
                        </div>
                    </div>
                }
                confirmText="Save Alert Settings"
                loading={isSubmitting}
            />

            <ConfirmationModal
                isOpen={!!isShowingGuide}
                onClose={() => setIsShowingGuide(null)}
                title="Connector Usage Guide"
                headerLabel="Technical Documentation"
                icon={<BookOpen className="w-5 h-5 text-[var(--primary)]" />}
                description={
                    <div className="space-y-6">
                        <div className="p-4 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl space-y-4">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-[var(--primary)]" />
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Standardized Interface</span>
                            </div>
                            <p className="text-[10px]">
                                This connector is automatically injected into your Cloud Run containers. You don&apos;t need to manually manage secrets or environment variables.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Environment Variable</Label>
                            <div className="p-3 bg-black/40 border border-[var(--border)] rounded-lg font-mono text-[8px] flex items-center justify-between">
                                <span className="text-[var(--primary)]">
                                    {isShowingGuide ? getStorageEnvKey(isShowingGuide) : 'DATABASE_URL'}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                    onClick={() => {
                                        if (!isShowingGuide) return;
                                        const key = getStorageEnvKey(isShowingGuide);
                                        navigator.clipboard.writeText(key);
                                        toast.success('Key copied to clipboard');
                                    }}
                                >
                                    <Copy className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Node.js Access</Label>
                            <div className="p-3 bg-black/40 border border-[var(--border)] rounded-lg font-mono text-[8px]">
                                <code className="text-[var(--foreground)]/80">
                                    const connectionString = process.env.{isShowingGuide ? getStorageEnvKey(isShowingGuide) : 'DATABASE_URL'};
                                </code>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Python Access</Label>
                            <div className="p-3 bg-black/40 border border-[var(--border)] rounded-lg font-mono text-[8px]">
                                <code className="text-[var(--foreground)]/80">
                                    import os<br />
                                    conn_str = os.environ.get(&apos;{isShowingGuide ? getStorageEnvKey(isShowingGuide) : 'DATABASE_URL'}&apos;)
                                </code>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Go Access</Label>
                            <div className="p-3 bg-black/40 border border-[var(--border)] rounded-lg font-mono text-[8px]">
                                <code className="text-[var(--foreground)]/80">
                                    import &quot;os&quot;<br />
                                    connStr := os.Getenv(&quot;{isShowingGuide ? getStorageEnvKey(isShowingGuide) : 'DATABASE_URL'}&quot;)
                                </code>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Deployment Region</Label>
                            <div className="flex items-center gap-2 px-1">
                                <Server className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                                <span className="text-[8px] font-bold uppercase tracking-wider">{(isShowingGuide?.metadata?.region as string) || projectRegion || 'GLOBAL/AUTO'}</span>
                            </div>
                        </div>

                        {egressIps && (
                            <div className="space-y-4 pt-4 border-t border-[var(--border)]">
                                <div className="flex items-center gap-2">
                                    <Network className="w-4 h-4 text-[var(--primary)]" />
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">IP Allowlist Assistant</span>
                                </div>
                                <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    IF YOUR EXTERNAL PROVIDER (LIKE SUPABASE OR MONGODB) USES A FIREWALL, ADD THESE GCP REGIONAL EGRESS RANGES FOR <span className="text-[var(--primary)]">{egressIps.region.toUpperCase()}</span>:
                                </p>
                                <div className="space-y-2">
                                    {egressIps.ips.map(ip => (
                                        <div key={ip} className="p-2 bg-black/40 border border-[var(--border)] rounded-lg font-mono text-[8px] flex items-center justify-between group">
                                            <span className="text-[var(--foreground)]/80">{ip}</span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-5 w-5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(ip);
                                                    toast.success('IP Range copied');
                                                }}
                                            >
                                                <Copy className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                {egressIps.isFallback && (
                                    <p className="text-[8px] font-bold uppercase text-[var(--warning)] flex items-center gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        USING FALLBACK RANGES. VERIFY REGION SETTINGS.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                }
                showConfirm={false}
                showCancel={false}
            />

            <ConfirmationModal
                isOpen={!!isTroubleshooting}
                onClose={() => {
                    setIsTroubleshooting(null);
                    setDiagnosticResult(null);
                }}
                title="Connection Troubleshooter"
                headerLabel="Diagnostic Intelligence"
                icon={<Wrench className="w-5 h-5 text-[var(--primary)]" />}
                description={
                    <div className="space-y-6">
                        <div className="p-4 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-[var(--primary)]" />
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Deep Multi-Layer Scan</span>
                                </div>
                                {!isDiagnosing && !diagnosticResult && (
                                    <Button
                                        onClick={handleDiagnose}
                                        className="h-8 text-[8px] font-bold uppercase tracking-wider bg-[var(--primary)]"
                                    >
                                        Run Diagnostics
                                    </Button>
                                )}
                            </div>
                            <p className="text-[10px]">
                                Run a comprehensive diagnostic to identify the root cause of connection failures across secrets, DNS, TCP, and IAM layers.
                            </p>
                        </div>

                        {isDiagnosing && (
                            <div className="py-8 flex flex-col items-center justify-center gap-4 animate-in fade-in">
                                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                                <div className="text-center">
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)] animate-pulse">Scanning infrastructure...</p>
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mt-1">Checking multi-layer connectivity</p>
                                </div>
                            </div>
                        )}

                        {diagnosticResult && (
                            <div className="space-y-4 animate-in slide-in-from-top-2">
                                <div className="space-y-2">
                                    {diagnosticResult.steps.map((step, i) => (
                                        <div key={i} className="p-3 border border-[var(--border)] rounded-xl bg-[var(--background)] space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    {step.status === 'success' ? (
                                                        <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />
                                                    ) : step.status === 'failure' ? (
                                                        <AlertCircle className="w-4 h-4 text-[var(--error)]" />
                                                    ) : (
                                                        <Loader2 className="w-4 h-4 text-[var(--primary)] animate-spin" />
                                                    )}
                                                    <span className="text-[8px] font-bold uppercase tracking-wider">{step.name}</span>
                                                </div>
                                                {step.latency !== undefined && (
                                                    <span className="text-[8px] font-mono font-bold text-[var(--muted-foreground)]">{step.latency}ms</span>
                                                )}
                                            </div>
                                            {step.error && (
                                                <div className="p-2 bg-[var(--error)]/5 rounded border border-[var(--error)]/10">
                                                    <p className="text-[8px] font-bold uppercase text-[var(--error)]">{step.error}</p>
                                                </div>
                                            )}
                                            {step.recommendation && (
                                                <div className="p-2 bg-[var(--primary)]/5 rounded border border-[var(--primary)]/10 flex items-start gap-2">
                                                    <Search className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                                                    <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] leading-relaxed">
                                                        <span className="text-[var(--primary)]">Recommendation:</span> {step.recommendation}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <div className="p-4 bg-[var(--muted)]/5 border border-[var(--border)] rounded-xl flex items-center justify-between">
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Total Scan Time</span>
                                    <span className="text-[8px] font-mono font-bold">{diagnosticResult.overallLatency}ms</span>
                                </div>

                                <Button
                                    variant="outline"
                                    onClick={handleDiagnose}
                                    className="w-full text-[8px] font-bold uppercase tracking-wider"
                                >
                                    Rerun Scan
                                </Button>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 border border-[var(--border)] rounded-xl space-y-1">
                                <div className="flex items-center gap-2">
                                    <ShieldAlert className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">IAM Identity</span>
                                </div>
                                <p className="text-[8px] font-bold uppercase truncate">roles/cloudsql.client</p>
                            </div>
                            <div className="p-3 border border-[var(--border)] rounded-xl space-y-1">
                                <div className="flex items-center gap-2">
                                    <Network className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Network Mode</span>
                                </div>
                                <p className="text-[8px] font-bold uppercase truncate">Direct VPC Egress</p>
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
                                    <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--error)]">Delete actual GCP Resource</Label>
                                    <p className="text-[8px] font-bold uppercase text-[var(--error)]/60">Permantently destroy the provisioned instance</p>
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

            <ConfirmationModal
                isOpen={!!isCloningId}
                onClose={() => setIsCloningId(null)}
                onConfirm={async () => {
                    if (isCloningId) {
                        await cloneStorageConfig(projectId, isCloningId, { includeData: cloneWithData });
                        setIsCloningId(null);
                    }
                }}
                title="Duplicate Storage Connector"
                description={
                    <div className="space-y-4">
                        <p className="text-[10px]">
                            Create a new storage connector with identical configuration. Secrets will be isolated in GCP Secret Manager.
                        </p>

                        {(storageConfigs.find(c => c.id === isCloningId)?.type.includes('cloud-sql') || storageConfigs.find(c => c.id === isCloningId)?.type === 'memorystore-redis' || storageConfigs.find(c => c.id === isCloningId)?.type === 'firestore') && (
                            <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-xl bg-[var(--muted)]/5">
                                <div className="space-y-0.5">
                                    <Label className="text-[8px] font-bold uppercase tracking-wider">Include Data snapshot</Label>
                                    <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]/60">Automated GCS-based export/import</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={cloneWithData}
                                    onChange={(e) => setCloneWithData(e.target.checked)}
                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                            </div>
                        )}

                        <div className="p-3 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                            <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] leading-relaxed">
                                CONFIGURATION WILL BE DUPLICATED IMMEDIATELY. IF SNAPSHOT IS INCLUDED, THE NEW CONNECTOR WILL REMAIN IN PROVISIONING STATE UNTIL DATA TRANSFER COMPLETES.
                            </p>
                        </div>
                    </div>
                }
                confirmText="Duplicate Connector"
            />

            <ConfirmationModal
                isOpen={!!isMigratingRegion}
                onClose={() => setIsMigratingRegion(null)}
                onConfirm={handleMigrateRegion}
                title="Migrate to Project Region"
                description={
                    <div className="space-y-4">
                        <div className="p-4 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-xl flex items-start gap-3">
                            <Network className="w-5 h-5 text-[var(--error)] shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-[var(--error)] uppercase">Performance Optimization</p>
                                <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-relaxed">
                                    Moving <strong>{isMigratingRegion?.name}</strong> to <span className="text-[var(--primary)]">{projectRegion}</span> will significantly reduce latency between your application and database.
                                </p>
                            </div>
                        </div>

                        <p className="text-[10px]">
                            This operation leverages the GCP Clone API to move your instance and data. A new instance will be created in the target region.
                        </p>

                        <div className="p-3 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                            <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] leading-relaxed">
                                THE CONNECTOR WILL REMAIN IN PROVISIONING STATE UNTIL THE MIGRATION COMPLETES. NO DATA WILL BE LOST.
                            </p>
                        </div>
                    </div>
                }
                confirmText={`Migrate to ${projectRegion}`}
                loading={isSubmitting}
            />

            <OptimizationModal
                isOpen={!!isManagingOptimization}
                onClose={() => setIsManagingOptimization(null)}
                storage={isManagingOptimization}
                onApply={(rec) => {
                    setIsScaling(isManagingOptimization);
                    if (isManagingOptimization?.type.includes('cloud-sql')) {
                        setScaleTier(rec.recommendedTier);
                    } else if (isManagingOptimization?.type === 'memorystore-redis') {
                        setScaleSizeGb(parseInt(rec.recommendedTier));
                    }
                    setIsManagingOptimization(null);
                }}
            />

            <DataPortabilityModal
                isOpen={!!isManagingPortability}
                onClose={() => setIsManagingPortability(null)}
                storage={isManagingPortability}
                projectId={projectId}
            />
        </Card>
    );
}
