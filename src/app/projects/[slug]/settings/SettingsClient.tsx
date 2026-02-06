'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Trash2, AlertTriangle, GitBranch, Globe, Terminal, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/moving-border';
import { RegionSettings } from '@/components/RegionSettings';
import { ResourceSettings } from '@/components/ResourceSettings';
import { BranchDeploymentsSettings } from '@/components/BranchDeploymentsSettings';
import { DomainsSection } from '@/components/DomainsSection';
import { EnvVariablesSection } from '@/components/EnvVariablesSection';
import type { Project, User, EnvVariable, Domain } from '@/types';
import { cn } from '@/lib/utils';

interface SettingsClientProps {
    project: Project;
    user: User;
}

type Tab = 'general' | 'domains' | 'env' | 'security';

export function SettingsClient({ project: initialProject, user }: SettingsClientProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>('general');
    const [project, setProject] = useState<Project>(initialProject);
    const [envVariables, setEnvVariables] = useState<EnvVariable[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    // Build Settings State
    const [buildCommand, setBuildCommand] = useState(project.buildCommand || '');
    const [installCommand, setInstallCommand] = useState(project.installCommand || '');
    const [rootDirectory, setRootDirectory] = useState(project.rootDirectory || '');
    const [outputDirectory, setOutputDirectory] = useState(project.outputDirectory || '');
    const [savingBuild, setSavingBuild] = useState(false);

    // Notifications State
    const [webhookUrl, setWebhookUrl] = useState(project.webhookUrl || '');
    const [emailNotifications, setEmailNotifications] = useState(project.emailNotifications || false);
    const [savingNotifications, setSavingNotifications] = useState(false);

    // Security State
    const [cloudArmorEnabled, setCloudArmorEnabled] = useState(project.cloudArmorEnabled || false);
    const [savingSecurity, setSavingSecurity] = useState(false);
    const [deletingProject, setDeletingProject] = useState(false);

    const fetchProjectData = useCallback(async () => {
        try {
            // We refresh the project data to ensure we have the latest
            const response = await fetch(`/api/projects/${project.id}`);
            if (response.ok) {
                const data = await response.json();
                setProject(data.project);
                // Update local state if needed, but usually we want to keep user input if they are editing
                // For now, we only update if not editing? No, let's just update refs or something.
                // Actually, standard practice: if user is editing, don't overwrite.
                // But for "refetch", usually implies "reload from server".
            }

            // Fetch env variables
            const envResponse = await fetch(`/api/projects/${project.id}/env`);
            if (envResponse.ok) {
                const envData = await envResponse.json();
                setEnvVariables(envData.envVariables || []);
            }

            // Fetch domains
            const domainsResponse = await fetch(`/api/projects/${project.id}/domains`);
            if (domainsResponse.ok) {
                const domainsData = await domainsResponse.json();
                setDomains(domainsData.domains || []);
            }
        } catch (error) {
            console.error('Failed to fetch project data:', error);
            toast.error('Failed to refresh project data');
        } finally {
            setLoadingData(false);
            router.refresh();
        }
    }, [project.id, router]);

    useEffect(() => {
        fetchProjectData();
    }, [fetchProjectData]);

    const handleSaveBuildSettings = async () => {
        setSavingBuild(true);
        const toastId = toast.loading('Saving build settings...');
        try {
            const response = await fetch(`/api/projects/${project.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    buildCommand,
                    installCommand,
                    rootDirectory,
                    outputDirectory,
                }),
            });

            if (response.ok) {
                toast.success('Build settings saved', { id: toastId });
                router.refresh();
            } else {
                toast.error('Failed to save settings', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error('Failed to save settings', { id: toastId });
        } finally {
            setSavingBuild(false);
        }
    };

    const handleSaveNotifications = async () => {
        setSavingNotifications(true);
        const toastId = toast.loading('Saving notifications...');
        try {
            const response = await fetch(`/api/projects/${project.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    webhookUrl,
                    emailNotifications,
                }),
            });

            if (response.ok) {
                toast.success('Notifications saved', { id: toastId });
                router.refresh();
            } else {
                toast.error('Failed to save notifications', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to save notifications:', error);
            toast.error('Failed to save notifications', { id: toastId });
        } finally {
            setSavingNotifications(false);
        }
    };

    const handleSaveSecurity = async () => {
        setSavingSecurity(true);
        const toastId = toast.loading('Saving security settings...');
        try {
            const response = await fetch(`/api/projects/${project.id}/security`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: cloudArmorEnabled,
                }),
            });

            if (response.ok) {
                toast.success('Security settings saved', { id: toastId });
                router.refresh();
            } else {
                toast.error('Failed to save security settings', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to save security settings:', error);
            toast.error('Failed to save security settings', { id: toastId });
        } finally {
            setSavingSecurity(false);
        }
    };

    const handleDeleteProject = async () => {
        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            return;
        }

        setDeletingProject(true);
        const toastId = toast.loading('Deleting project...');

        try {
            const response = await fetch(`/api/projects/${project.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success('Project deleted successfully', { id: toastId });
                router.push('/dashboard');
            } else {
                const data = await response.json();
                toast.error(data.error || 'Failed to delete project', { id: toastId });
                setDeletingProject(false);
            }
        } catch (error) {
            console.error('Failed to delete project:', error);
            toast.error('Failed to delete project', { id: toastId });
            setDeletingProject(false);
        }
    };

    const tabs = [
        { id: 'general', label: 'General', icon: Terminal },
        { id: 'domains', label: 'Domains', icon: Globe },
        { id: 'env', label: 'Env Vars', icon: Terminal },
        { id: 'security', label: 'Security', icon: Shield },
    ];

    return (
        <div className="space-y-8">
            {/* Tabs Navigation */}
            <div className="flex border-b border-[var(--border)] overflow-x-auto no-scrollbar">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as Tab)}
                            className={cn(
                                "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                                activeTab === tab.id
                                    ? "border-[var(--primary)] text-[var(--foreground)]"
                                    : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* General Tab */}
            {activeTab === 'general' && (
                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <section>
                        <h2 className="text-xl font-semibold mb-6">Build Configuration</h2>
                        <div className="grid gap-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                                <div className="md:col-span-1">
                                    <label htmlFor="build-command" className="block text-sm font-medium">Build Command</label>
                                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                        Command to build your project
                                    </p>
                                </div>
                                <div className="md:col-span-2">
                                    <input
                                        id="build-command"
                                        type="text"
                                        value={buildCommand}
                                        onChange={(e) => setBuildCommand(e.target.value)}
                                        placeholder="npm run build"
                                        className="input w-full"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                                <div className="md:col-span-1">
                                    <label htmlFor="output-directory" className="block text-sm font-medium">Output Directory</label>
                                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                        Directory where build artifacts are located
                                    </p>
                                </div>
                                <div className="md:col-span-2">
                                    <input
                                        id="output-directory"
                                        type="text"
                                        value={outputDirectory}
                                        onChange={(e) => setOutputDirectory(e.target.value)}
                                        placeholder=".next"
                                        className="input w-full"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                                <div className="md:col-span-1">
                                    <label htmlFor="install-command" className="block text-sm font-medium">Install Command</label>
                                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                        Command to install dependencies
                                    </p>
                                </div>
                                <div className="md:col-span-2">
                                    <input
                                        id="install-command"
                                        type="text"
                                        value={installCommand}
                                        onChange={(e) => setInstallCommand(e.target.value)}
                                        placeholder="npm install"
                                        className="input w-full"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                                <div className="md:col-span-1">
                                    <label htmlFor="root-directory" className="block text-sm font-medium">Root Directory</label>
                                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                        Directory where your code lives
                                    </p>
                                </div>
                                <div className="md:col-span-2">
                                    <input
                                        id="root-directory"
                                        type="text"
                                        value={rootDirectory}
                                        onChange={(e) => setRootDirectory(e.target.value)}
                                        placeholder="./"
                                        className="input w-full"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button
                                    as="button"
                                    onClick={handleSaveBuildSettings}
                                    disabled={savingBuild}
                                    borderRadius="0.5rem"
                                    className="bg-zinc-900 text-white dark:bg-zinc-900 dark:text-white border-zinc-800"
                                    containerClassName="w-32 h-10"
                                >
                                    {savingBuild ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save'
                                    )}
                                </Button>
                            </div>
                        </div>
                    </section>

                    <RegionSettings
                        projectId={project.id}
                        currentRegion={project.region}
                        onUpdate={fetchProjectData}
                    />

                    <ResourceSettings
                        projectId={project.id}
                        initialResources={project.resources}
                        onUpdate={fetchProjectData}
                    />

                    <BranchDeploymentsSettings
                        projectId={project.id}
                        initialBranches={project.autodeployBranches || []}
                        onUpdate={fetchProjectData}
                    />

                    <section className="card">
                        <h2 className="text-lg font-semibold mb-4">Notifications</h2>
                        <div className="space-y-6">
                            <div className="flex items-start gap-3 p-4 border border-[var(--border)] rounded-md bg-[var(--background)]">
                                <input
                                    id="email-notifications"
                                    type="checkbox"
                                    checked={emailNotifications}
                                    onChange={(e) => setEmailNotifications(e.target.checked)}
                                    className="mt-1 w-4 h-4 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                                <div>
                                    <label htmlFor="email-notifications" className="block text-sm font-medium">
                                        Email Notifications
                                    </label>
                                    <p className="text-xs text-[var(--muted-foreground)]">
                                        Receive email notifications when a deployment succeeds or fails.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="webhook-url" className="block text-sm font-medium mb-1">Webhook URL</label>
                                <input
                                    id="webhook-url"
                                    type="text"
                                    value={webhookUrl}
                                    onChange={(e) => setWebhookUrl(e.target.value)}
                                    placeholder="https://discord.com/api/webhooks/..."
                                    className="input w-full"
                                />
                                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                    Receive notifications when a build fails. Supports Discord, Slack, etc.
                                </p>
                            </div>

                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={handleSaveNotifications}
                                    disabled={savingNotifications}
                                    className="btn btn-primary"
                                >
                                    {savingNotifications ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save'
                                    )}
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            {/* Domains Tab */}
            {activeTab === 'domains' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <DomainsSection
                        projectId={project.id}
                        initialDomains={domains}
                        productionUrl={project.productionUrl}
                        onUpdate={fetchProjectData}
                    />
                </div>
            )}

            {/* Env Vars Tab */}
            {activeTab === 'env' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <EnvVariablesSection
                        projectId={project.id}
                        initialEnvVariables={envVariables}
                        onUpdate={fetchProjectData}
                    />
                </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="card">
                        <h2 className="text-lg font-semibold mb-4">Web Application Firewall</h2>
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 p-4 border border-[var(--border)] rounded-md bg-[var(--background)]">
                                <input
                                    id="cloud-armor"
                                    type="checkbox"
                                    checked={cloudArmorEnabled}
                                    onChange={(e) => setCloudArmorEnabled(e.target.checked)}
                                    className="mt-1 w-4 h-4 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                                <div>
                                    <label htmlFor="cloud-armor" className="block text-sm font-medium">
                                        Cloud Armor WAF
                                    </label>
                                    <p className="text-xs text-[var(--muted-foreground)]">
                                        Enable Google Cloud Armor Web Application Firewall to protect against DDoS and web attacks.
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button
                                    as="button"
                                    onClick={handleSaveSecurity}
                                    disabled={savingSecurity}
                                    borderRadius="0.5rem"
                                    className="bg-zinc-900 text-white dark:bg-zinc-900 dark:text-white border-zinc-800"
                                    containerClassName="w-32 h-10"
                                >
                                    {savingSecurity ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save'
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="card border-red-500/30 bg-red-500/5">
                        <h2 className="text-lg font-semibold mb-4 text-red-500 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Danger Zone
                        </h2>
                        <div className="flex items-center justify-between py-3">
                            <div>
                                <p className="font-medium text-[var(--foreground)]">Delete Project</p>
                                <p className="text-sm text-[var(--muted-foreground)]">
                                    Permanently delete this project and all its deployments.
                                </p>
                            </div>
                            <Button
                                as="button"
                                onClick={handleDeleteProject}
                                disabled={deletingProject}
                                borderRadius="0.5rem"
                                className="bg-red-500 text-white border-red-600 hover:bg-red-600"
                                containerClassName="w-40 h-10"
                            >
                                {deletingProject ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete Project
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
