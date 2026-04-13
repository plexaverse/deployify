import { StateCreator } from 'zustand';
import type { Project, Deployment, EnvVariable, Domain, AnalyticsStats, CronJobConfig, StorageConfig, DataLabAuditLog, TeamRole } from '@/types';
import { toast } from 'sonner';

export interface ProjectSlice {
    activeProjectId: string | null;
    currentProject: Project | null;
    currentDeployments: Deployment[];
    errorCount: number | null;
    isLoadingProject: boolean;
    isLoadingAnalytics: boolean;
    isRedeploying: boolean;
    selectedLogsId: string | null;
    rollbackDeployment: Deployment | null;
    analyticsData: AnalyticsStats | null;
    userRole: TeamRole | null;

    // Settings Form State
    buildCommand: string;
    installCommand: string;
    rootDirectory: string;
    outputDirectory: string;
    framework: string;
    webhookUrl: string;
    emailNotifications: boolean;
    autoDeployPrs: boolean;
    cloudArmorEnabled: boolean;
    projectEnvVariables: EnvVariable[];
    projectDomains: Domain[];
    projectStorageConfigs: StorageConfig[];
    projectStorageAuditLogs: DataLabAuditLog[];
    activeMigrations: Record<string, { status: string; logs?: string; error?: string; operationName?: string }>;

    // Saving States
    isSavingProjectSettings: boolean;
    isSavingWebhook: boolean;
    isSavingSecurity: boolean;
    isLoadingEnv: boolean;
    isLoadingDomains: boolean;
    isLoadingStorage: boolean;

    setActiveProjectId: (id: string | null) => void;
    setCurrentProject: (project: Project | null) => void;
    setCurrentDeployments: (deployments: Deployment[]) => void;
    setErrorCount: (count: number | null) => void;
    setLoadingProject: (isLoading: boolean) => void;
    setRedeploying: (isRedeploying: boolean) => void;
    setSelectedLogsId: (id: string | null) => void;
    setRollbackDeployment: (deployment: Deployment | null) => void;

    // Settings Setters
    setProjectSettingsField: (field: string, value: string | boolean | number | string[]) => void;
    setProjectEnvVariables: (vars: EnvVariable[]) => void;
    setProjectDomains: (domains: Domain[]) => void;

    fetchProjectDetails: (projectId: string) => Promise<void>;
    fetchDeployments: (projectId: string) => Promise<void>;
    redeployProject: (projectId: string, force?: boolean) => Promise<void>;
    cancelDeployment: (projectId: string, deploymentId: string) => Promise<void>;

    // Settings Actions
    saveProjectSettings: (projectId: string) => Promise<void>;
    saveNotificationSettings: (projectId: string) => Promise<void>;
    saveSecuritySettings: (projectId: string) => Promise<void>;
    deleteProject: (projectId: string) => Promise<boolean>;

    // Env Var Actions
    fetchProjectEnvVariables: (projectId: string) => Promise<void>;
    addEnvVariable: (projectId: string, variable: Partial<EnvVariable>) => Promise<boolean>;
    deleteEnvVariable: (projectId: string, envId: string) => Promise<boolean>;
    revealEnvVariable: (projectId: string, envId: string) => Promise<string | null>;

    // Domain Actions
    fetchProjectDomains: (projectId: string) => Promise<void>;
    addDomain: (projectId: string, domain: string) => Promise<{ domain: Domain; dnsRecords: { type: string; name: string; value: string }[] } | null>;
    deleteDomain: (projectId: string, domainId: string) => Promise<boolean>;

    // Analytics Actions
    fetchProjectAnalytics: (projectId: string, period?: string) => Promise<void>;

    updateProjectRegion: (projectId: string, region: string | null) => Promise<boolean>;
    updateProjectResources: (projectId: string, resources: NonNullable<Project['resources']>) => Promise<boolean>;
    updateBranchSettings: (projectId: string, settings: { autodeployBranches: string[], branchEnvironments: NonNullable<Project['branchEnvironments']> }) => Promise<boolean>;
    updateProjectCrons: (projectId: string, crons: CronJobConfig[]) => Promise<boolean>;

    // Storage Actions
    fetchProjectStorage: (projectId: string) => Promise<void>;
    addStorageConfig: (projectId: string, config: Partial<StorageConfig>, connectionString?: string, provision?: boolean) => Promise<boolean>;
    updateStorageConfig: (projectId: string, storageId: string, config: Partial<StorageConfig>, connectionString?: string) => Promise<boolean>;
    deleteStorageConfig: (projectId: string, storageId: string, deleteResource?: boolean) => Promise<boolean>;
    validateStorageConnection: (projectId: string, storageId: string) => Promise<{ valid: boolean; error?: string }>;
    syncStorageStatus: (projectId: string, storageId: string) => Promise<{ status: string; error?: string }>;
    diagnoseStorageConnection: (projectId: string, storageId: string) => Promise<{ success: boolean; diagnostic?: import('@/lib/gcp/storage-validator').DiagnosticResult }>;
    updateStorageAlerts: (projectId: string, storageId: string, alerts: StorageConfig['alertSettings']) => Promise<boolean>;
    fetchProjectStorageAuditLogs: (projectId: string, storageId: string) => Promise<void>;
    rotateStorageCredentials: (projectId: string, storageId: string, connectionString: string) => Promise<boolean>;
    cloneStorageConfig: (projectId: string, storageId: string, overrides?: { name?: string; environment?: 'production' | 'preview' | 'both'; envKey?: string; includeData?: boolean }) => Promise<boolean>;
    runProjectMigration: (projectId: string, storageId: string, command: string) => Promise<{ success: boolean; operationName?: string }>;
    runProjectRollback: (projectId: string, storageId: string, command: string) => Promise<{ success: boolean; operationName?: string }>;
    fetchMigrationStatus: (projectId: string, storageId: string, operationName: string) => Promise<{ status: string; logs?: string; error?: string }>;
    startMigrationPolling: (projectId: string, storageId: string, operationName: string) => void;
    clearMigrationStatus: (storageId: string) => void;
}

export const createProjectSlice: StateCreator<ProjectSlice> = (set, get) => ({
    activeProjectId: null,
    currentProject: null,
    currentDeployments: [],
    errorCount: null,
    isLoadingProject: true,
    isRedeploying: false,
    selectedLogsId: null,
    rollbackDeployment: null,
    analyticsData: null,

    // Settings Form State Initial
    buildCommand: '',
    installCommand: '',
    rootDirectory: '',
    outputDirectory: '',
    framework: '',
    webhookUrl: '',
    emailNotifications: false,
    autoDeployPrs: true,
    cloudArmorEnabled: false,
    projectEnvVariables: [],
    projectDomains: [],
    projectStorageConfigs: [],
    projectStorageAuditLogs: [],
    userRole: null,
    activeMigrations: {},

    // Saving States Initial
    isSavingProjectSettings: false,
    isSavingWebhook: false,
    isSavingSecurity: false,
    isLoadingEnv: false,
    isLoadingDomains: false,
    isLoadingStorage: false,
    isLoadingAnalytics: false,

    setActiveProjectId: (id) => set({ activeProjectId: id }),
    setCurrentProject: (project) => set({ currentProject: project }),
    setCurrentDeployments: (deployments) => set({ currentDeployments: deployments }),
    setErrorCount: (count) => set({ errorCount: count }),
    setLoadingProject: (isLoading) => set({ isLoadingProject: isLoading }),
    setRedeploying: (isRedeploying) => set({ isRedeploying: isRedeploying }),
    setSelectedLogsId: (id) => set({ selectedLogsId: id }),
    setRollbackDeployment: (deployment) => set({ rollbackDeployment: deployment }),

    setProjectSettingsField: (field, value) => set((state) => ({ ...state, [field]: value })),
    setProjectEnvVariables: (vars) => set({ projectEnvVariables: vars }),
    setProjectDomains: (domains) => set({ projectDomains: domains }),

    fetchProjectDetails: async (projectId) => {
        const { currentProject } = get();
        // Only show global loading if we don't have this project's data yet
        if (!currentProject || currentProject.id !== projectId) {
            set({ isLoadingProject: true });
        }
        try {
            const [projectResponse, deploymentsResponse, statsResponse] = await Promise.all([
                fetch(`/api/projects/${projectId}`),
                fetch(`/api/projects/${projectId}/deployments`),
                fetch(`/api/projects/${projectId}/logs/stats`)
            ]);

            if (projectResponse.ok) {
                const projectData = await projectResponse.json();
                const project = projectData.project;
                set({
                    currentProject: project,
                    userRole: projectData.role || 'owner',
                    buildCommand: project.buildCommand || '',
                    installCommand: project.installCommand || '',
                    rootDirectory: project.rootDirectory || '',
                    outputDirectory: project.outputDirectory || '',
                    framework: project.framework || 'nextjs',
                    webhookUrl: project.webhookUrl || '',
                    emailNotifications: project.emailNotifications || false,
                    autoDeployPrs: project.autoDeployPrs !== undefined ? project.autoDeployPrs : true,
                    cloudArmorEnabled: project.cloudArmorEnabled || false,
                });

                if (deploymentsResponse.ok) {
                    const deploymentsData = await deploymentsResponse.json();
                    set({ currentDeployments: deploymentsData.deployments || [] });
                } else {
                    set({ currentDeployments: projectData.deployments || [] });
                }

                if (statsResponse.ok) {
                    const statsData = await statsResponse.json();
                    set({ errorCount: statsData.errorCount });
                }
            }
        } catch (error) {
            console.error('Failed to fetch project details:', error);
        } finally {
            set({ isLoadingProject: false });
        }
    },

    fetchDeployments: async (projectId) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/deployments`);
            if (response.ok) {
                const data = await response.json();
                set({ currentDeployments: data.deployments || [] });
            }
        } catch (error) {
            console.error('Failed to fetch deployments:', error);
        }
    },

    redeployProject: async (projectId, force = false) => {
        set({ isRedeploying: true });
        try {
            const response = await fetch(`/api/projects/${projectId}/deploy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force }),
            });

            if (response.ok) {
                // Re-fetch using the new action
                await get().fetchDeployments(projectId);
            }
        } catch (error) {
            console.error('Failed to trigger deployment:', error);
        } finally {
            set({ isRedeploying: false });
        }
    },

    cancelDeployment: async (projectId, deploymentId) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/deploy?deploymentId=${deploymentId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                await get().fetchDeployments(projectId);
            }
        } catch (error) {
            console.error('Failed to cancel deployment:', error);
        }
    },

    saveProjectSettings: async (projectId) => {
        const { buildCommand, installCommand, rootDirectory, outputDirectory, framework, autoDeployPrs } = get();
        set({ isSavingProjectSettings: true });
        const toastId = toast.loading('Saving settings...');
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    buildCommand,
                    installCommand,
                    rootDirectory,
                    outputDirectory,
                    framework,
                    autoDeployPrs,
                }),
            });

            if (response.ok) {
                toast.success('Settings saved', { id: toastId });
                // We might want to re-fetch details or just update currentProject partially
            } else {
                toast.error('Failed to save settings', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error('Failed to save settings', { id: toastId });
        } finally {
            set({ isSavingProjectSettings: false });
        }
    },

    saveNotificationSettings: async (projectId) => {
        const { webhookUrl, emailNotifications } = get();
        set({ isSavingWebhook: true });
        const toastId = toast.loading('Saving webhook...');
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    webhookUrl,
                    emailNotifications,
                }),
            });

            if (response.ok) {
                toast.success('Notifications saved', { id: toastId });
            } else {
                toast.error('Failed to save notifications', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to save notifications:', error);
            toast.error('Failed to save notifications', { id: toastId });
        } finally {
            set({ isSavingWebhook: false });
        }
    },

    saveSecuritySettings: async (projectId) => {
        const { cloudArmorEnabled } = get();
        set({ isSavingSecurity: true });
        const toastId = toast.loading('Saving security settings...');
        try {
            const response = await fetch(`/api/projects/${projectId}/security`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: cloudArmorEnabled,
                }),
            });

            if (response.ok) {
                toast.success('Security settings saved', { id: toastId });
            } else {
                toast.error('Failed to save security settings', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to save security settings:', error);
            toast.error('Failed to save security settings', { id: toastId });
        } finally {
            set({ isSavingSecurity: false });
        }
    },

    deleteProject: async (projectId) => {
        const toastId = toast.loading('Deleting project...');
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success('Project deleted successfully', { id: toastId });
                return true;
            } else {
                const data = await response.json();
                toast.error(data.error || 'Failed to delete project', { id: toastId });
                return false;
            }
        } catch (error) {
            console.error('Failed to delete project:', error);
            toast.error('Failed to delete project', { id: toastId });
            return false;
        }
    },

    runProjectMigration: async (projectId, storageId, command) => {
        const toastId = toast.loading('Triggering migration...');
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/migrations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to trigger migration');
            }

            toast.success('Migration operation triggered successfully', { id: toastId });

            // Start polling automatically
            get().startMigrationPolling(projectId, storageId, data.operationName);

            return { success: true, operationName: data.operationName };
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to trigger migration', { id: toastId });
            return { success: false };
        }
    },

    runProjectRollback: async (projectId, storageId, command) => {
        const toastId = toast.loading('Triggering rollback...');
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/migrations/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to trigger rollback');
            }

            toast.success('Rollback operation triggered successfully', { id: toastId });

            // Start polling automatically using the same migration polling mechanism
            get().startMigrationPolling(projectId, storageId, data.operationName);

            return { success: true, operationName: data.operationName };
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to trigger rollback', { id: toastId });
            return { success: false };
        }
    },

    fetchMigrationStatus: async (projectId, storageId, operationName) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/migrations?operationId=${encodeURIComponent(operationName)}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch migration status');
            }

            return {
                status: data.status,
                logs: data.logs,
                error: data.error
            };
        } catch (error) {
            console.error('Failed to fetch migration status:', error);
            return { status: 'FAILURE', error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    startMigrationPolling: (projectId, storageId, operationName) => {
        const poll = async () => {
            // Check if it was cleared in the meantime
            if (!get().activeMigrations[storageId]) return;

            const result = await get().fetchMigrationStatus(projectId, storageId, operationName);

            // Re-check if cleared after async call
            if (!get().activeMigrations[storageId]) return;

            set((state) => ({
                activeMigrations: {
                    ...state.activeMigrations,
                    [storageId]: {
                        ...result,
                        operationName
                    }
                }
            }));

            // Continue polling if still working or queued
            if (result.status === 'WORKING' || result.status === 'QUEUED') {
                setTimeout(poll, 3000);
            }
        };

        // Initialize state and start polling
        set((state) => ({
            activeMigrations: {
                ...state.activeMigrations,
                [storageId]: {
                    status: 'QUEUED',
                    operationName,
                    logs: 'Initializing migration build...'
                }
            }
        }));

        poll();
    },

    clearMigrationStatus: (storageId) => {
        set((state) => {
            const activeMigrations = { ...state.activeMigrations };
            delete activeMigrations[storageId];
            return { activeMigrations };
        });
    },

    fetchProjectEnvVariables: async (projectId) => {
        set({ isLoadingEnv: true });
        try {
            const response = await fetch(`/api/projects/${projectId}/env`);
            if (response.ok) {
                const data = await response.json();
                set({ projectEnvVariables: data.envVariables || [] });
            }
        } catch (error) {
            console.error('Failed to fetch env variables:', error);
        } finally {
            set({ isLoadingEnv: false });
        }
    },

    addEnvVariable: async (projectId, variable) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/env`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(variable),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to add environment variable');
            }

            const { projectEnvVariables } = get();
            set({ projectEnvVariables: [...projectEnvVariables, data.envVariable] });
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to add environment variable');
            return false;
        }
    },

    revealEnvVariable: async (projectId, envId) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/env/${envId}/reveal`);
            if (response.ok) {
                const data = await response.json();
                return data.value;
            }
            return null;
        } catch (error) {
            console.error('Failed to reveal env variable:', error);
            return null;
        }
    },

    deleteEnvVariable: async (projectId, envId) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/env?envId=${envId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete environment variable');
            }

            const { projectEnvVariables } = get();
            set({ projectEnvVariables: projectEnvVariables.filter((env) => env.id !== envId) });
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete environment variable');
            return false;
        }
    },

    fetchProjectDomains: async (projectId) => {
        set({ isLoadingDomains: true });
        try {
            const response = await fetch(`/api/projects/${projectId}/domains`);
            if (response.ok) {
                const data = await response.json();
                set({ projectDomains: data.domains || [] });
            }
        } catch (error) {
            console.error('Failed to fetch domains:', error);
        } finally {
            set({ isLoadingDomains: false });
        }
    },

    addDomain: async (projectId, domain) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/domains`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to add domain');
            }

            const { projectDomains } = get();
            set({ projectDomains: [...projectDomains, data.domain] });
            return data;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to add domain');
            return null;
        }
    },

    deleteDomain: async (projectId, domainId) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/domains?domainId=${domainId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete domain');
            }

            const { projectDomains } = get();
            set({ projectDomains: projectDomains.filter((d) => d.id !== domainId) });
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete domain');
            return false;
        }
    },

    updateProjectRegion: async (projectId: string, region: string | null) => {
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ region }),
            });
            if (response.ok) {
                const data = await response.json();
                set({ currentProject: data.project });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to update project region:', error);
            return false;
        }
    },

    updateProjectResources: async (projectId: string, resources: NonNullable<Project['resources']>) => {
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resources }),
            });
            if (response.ok) {
                const data = await response.json();
                set({ currentProject: data.project });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to update project resources:', error);
            return false;
        }
    },

    updateBranchSettings: async (projectId: string, settings: { autodeployBranches: string[], branchEnvironments: NonNullable<Project['branchEnvironments']> }) => {
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            if (response.ok) {
                const data = await response.json();
                set({ currentProject: data.project });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to update branch settings:', error);
            return false;
        }
    },

    updateProjectCrons: async (projectId: string, crons: CronJobConfig[]) => {
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ crons }),
            });
            if (response.ok) {
                const data = await response.json();
                set({ currentProject: data.project });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to update project crons:', error);
            return false;
        }
    },

    fetchProjectStorage: async (projectId) => {
        set({ isLoadingStorage: true });
        try {
            const response = await fetch(`/api/projects/${projectId}/storage`);
            if (response.ok) {
                const data = await response.json();
                set({ projectStorageConfigs: data.storageConfigs || [] });
            }
        } catch (error) {
            console.error('Failed to fetch storage configs:', error);
        } finally {
            set({ isLoadingStorage: false });
        }
    },

    addStorageConfig: async (projectId, storageConfig, connectionString, provision) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...storageConfig, connectionString, provision }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to add storage configuration');
            }

            const { projectStorageConfigs } = get();
            set({ projectStorageConfigs: [...projectStorageConfigs, data.storageConfig] });
            toast.success('Storage configuration added successfully');
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to add storage configuration');
            return false;
        }
    },

    updateStorageConfig: async (projectId, storageId, storageConfig, connectionString) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storageId, ...storageConfig, connectionString }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update storage configuration');
            }

            const { projectStorageConfigs } = get();
            set({
                projectStorageConfigs: projectStorageConfigs.map((s) =>
                    s.id === storageId ? data.storageConfig : s
                )
            });
            toast.success('Storage configuration updated');
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update storage configuration');
            return false;
        }
    },

    deleteStorageConfig: async (projectId, storageId, deleteResource = false) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage?storageId=${storageId}${deleteResource ? '&deleteResource=true' : ''}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete storage configuration');
            }

            const { projectStorageConfigs } = get();
            set({ projectStorageConfigs: projectStorageConfigs.filter((s) => s.id !== storageId) });
            toast.success('Storage configuration deleted');
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete storage configuration');
            return false;
        }
    },

    validateStorageConnection: async (projectId, storageId) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/validate`, {
                method: 'POST',
            });
            const data = await response.json();

            if (response.ok && data.success) {
                const { projectStorageConfigs } = get();
                set({
                    projectStorageConfigs: projectStorageConfigs.map((s) =>
                        s.id === storageId ? {
                            ...s,
                            status: data.status,
                            lastValidatedAt: data.lastValidatedAt ? new Date(data.lastValidatedAt) : new Date(),
                            lastError: data.error
                        } : s
                    )
                });
            }

            return { valid: response.ok && data.valid, error: data.error };
        } catch (error) {
            return { valid: false, error: error instanceof Error ? error.message : 'Connection validation failed' };
        }
    },

    syncStorageStatus: async (projectId, storageId) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/sync`);
            const data = await response.json();

            if (response.ok && data.success) {
                const { projectStorageConfigs } = get();
                set({
                    projectStorageConfigs: projectStorageConfigs.map((s) =>
                        s.id === storageId ? {
                            ...s,
                            status: data.status,
                            lastSyncedAt: data.lastSyncedAt ? new Date(data.lastSyncedAt) : s.lastSyncedAt,
                            activeAlerts: data.activeAlerts,
                            lastError: data.error,
                            updatedAt: new Date()
                        } : s
                    )
                });
                if (data.status === 'active') {
                    toast.success('Storage synchronized');
                }
            }

            return { status: data.status, error: data.error };
        } catch (error) {
            return { status: 'error', error: error instanceof Error ? error.message : 'Sync failed' };
        }
    },

    diagnoseStorageConnection: async (projectId, storageId) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/diagnose`, {
                method: 'POST',
            });
            const data = await response.json();

            if (response.ok && data.success) {
                return { success: true, diagnostic: data.diagnostic };
            }

            return { success: false };
        } catch (error) {
            console.error('Failed to diagnose connection:', error);
            return { success: false };
        }
    },

    updateStorageAlerts: async (projectId, storageId, alerts) => {
        const toastId = toast.loading('Updating alert settings...');
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/alerts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alerts }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update alert settings');
            }

            const { projectStorageConfigs } = get();
            set({
                projectStorageConfigs: projectStorageConfigs.map((s) =>
                    s.id === storageId ? data.storageConfig : s
                )
            });

            toast.success('Alert settings updated', { id: toastId });
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update alerts', { id: toastId });
            return false;
        }
    },

    fetchProjectStorageAuditLogs: async (projectId, storageId) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/audit`);
            if (response.ok) {
                const data = await response.json();
                set({ projectStorageAuditLogs: data.auditLogs || [] });
            }
        } catch (error) {
            console.error('Failed to fetch storage audit logs:', error);
        }
    },

    rotateStorageCredentials: async (projectId, storageId, connectionString) => {
        const toastId = toast.loading('Rotating credentials...');
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/rotate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionString }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to rotate credentials');
            }

            const { projectStorageConfigs } = get();
            set({
                projectStorageConfigs: projectStorageConfigs.map((s) =>
                    s.id === storageId ? {
                        ...data.storageConfig,
                        lastRotatedAt: data.lastRotatedAt ? new Date(data.lastRotatedAt) : new Date(),
                        updatedAt: new Date()
                    } : s
                )
            });

            toast.success('Credentials rotated successfully', { id: toastId });
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to rotate credentials', { id: toastId });
            return false;
        }
    },

    cloneStorageConfig: async (projectId, storageId, overrides) => {
        const toastId = toast.loading('Cloning configuration...');
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${storageId}/clone`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ overrides }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to clone configuration');
            }

            const { projectStorageConfigs } = get();
            set({ projectStorageConfigs: [...projectStorageConfigs, data.storageConfig] });

            toast.success('Configuration cloned successfully', { id: toastId });
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to clone configuration', { id: toastId });
            return false;
        }
    },

    fetchProjectAnalytics: async (projectId, period = '30d') => {
        set({ isLoadingAnalytics: true });
        try {
            // First we need to fetch the project to get the siteId/slug if not already loaded
            // But we'll assume the API handles projectId directly
            const response = await fetch(`/api/projects/${projectId}/analytics/stats?period=${period}`);
            if (response.ok) {
                const data = await response.json();
                set({ analyticsData: data.stats });
            }
        } catch (error) {
            console.error('Failed to fetch project analytics:', error);
        } finally {
            set({ isLoadingAnalytics: false });
        }
    },
});
