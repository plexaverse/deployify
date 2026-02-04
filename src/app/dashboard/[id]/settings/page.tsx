'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Project, EnvVariable, Domain } from '@/types';
import { EnvVariablesSection } from '@/components/EnvVariablesSection';
import { DomainsSection } from '@/components/DomainsSection';
import { RegionSettings } from '@/components/RegionSettings';

export default function ProjectSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [envVariables, setEnvVariables] = useState<EnvVariable[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [loading, setLoading] = useState(true);

    // Build settings state
    const [buildCommand, setBuildCommand] = useState('');
    const [installCommand, setInstallCommand] = useState('');
    const [rootDirectory, setRootDirectory] = useState('');
    const [outputDirectory, setOutputDirectory] = useState('');
    const [webhookUrl, setWebhookUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [savingWebhook, setSavingWebhook] = useState(false);

    const fetchProject = async () => {
        try {
            const response = await fetch(`/api/projects/${params.id}`);

            if (!response.ok) {
                router.push('/dashboard');
                return;
            }

            const data = await response.json();
            setProject(data.project);
            setBuildCommand(data.project.buildCommand || '');
            setInstallCommand(data.project.installCommand || '');
            setRootDirectory(data.project.rootDirectory || '');
            setOutputDirectory(data.project.outputDirectory || '');
            setWebhookUrl(data.project.webhookUrl || '');

            // Fetch env variables separately
            const envResponse = await fetch(`/api/projects/${params.id}/env`);
            if (envResponse.ok) {
                const envData = await envResponse.json();
                setEnvVariables(envData.envVariables || []);
            }

            // Fetch domains separately
            const domainsResponse = await fetch(`/api/projects/${params.id}/domains`);
            if (domainsResponse.ok) {
                const domainsData = await domainsResponse.json();
                setDomains(domainsData.domains || []);
            }
        } catch (error) {
            console.error('Failed to fetch project:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (params.id) {
            fetchProject();
        }
    }, [params.id, router]);

    const handleDeleteProject = async () => {
        if (!project) return;

        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            return;
        }

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
            }
        } catch (error) {
            console.error('Failed to delete project:', error);
            toast.error('Failed to delete project', { id: toastId });
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--muted-foreground)]" />
                </div>
            </div>
        );
    }

    if (!project) {
        return null;
    }

    return (
        <div className="p-8 max-w-4xl">
            {/* Breadcrumb */}
            <Link
                href={`/dashboard/${project.id}`}
                className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to {project.name}
            </Link>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold mb-1">Project Settings</h1>
                <p className="text-[var(--muted-foreground)]">
                    Configure settings for {project.name}
                </p>
            </div>

            {/* Domains Section */}
            <DomainsSection
                projectId={project.id}
                initialDomains={domains}
                productionUrl={project.productionUrl}
                onUpdate={fetchProject}
            />

            {/* Environment Variables Section */}
            <div className="mt-8">
                <EnvVariablesSection
                    projectId={project.id}
                    initialEnvVariables={envVariables}
                    onUpdate={fetchProject}
                />
            </div>

            {/* Region Settings */}
            <RegionSettings
                projectId={project.id}
                currentRegion={project.region}
                onUpdate={fetchProject}
            />

            {/* Build Settings */}
            <div className="card mt-8">
                <h2 className="text-lg font-semibold mb-4">Build Settings</h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="build-command" className="block text-sm font-medium mb-1">Build Command</label>
                            <input
                                id="build-command"
                                type="text"
                                value={buildCommand}
                                onChange={(e) => setBuildCommand(e.target.value)}
                                placeholder="npm run build"
                                className="input w-full"
                            />
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                Command to build your project
                            </p>
                        </div>
                        <div>
                            <label htmlFor="output-directory" className="block text-sm font-medium mb-1">Output Directory</label>
                            <input
                                id="output-directory"
                                type="text"
                                value={outputDirectory}
                                onChange={(e) => setOutputDirectory(e.target.value)}
                                placeholder=".next"
                                className="input w-full"
                            />
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                Directory where build artifacts are located
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="install-command" className="block text-sm font-medium mb-1">Install Command</label>
                            <input
                                id="install-command"
                                type="text"
                                value={installCommand}
                                onChange={(e) => setInstallCommand(e.target.value)}
                                placeholder="npm install"
                                className="input w-full"
                            />
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                Command to install dependencies
                            </p>
                        </div>
                        <div>
                            <label htmlFor="root-directory" className="block text-sm font-medium mb-1">Root Directory</label>
                            <input
                                id="root-directory"
                                type="text"
                                value={rootDirectory}
                                onChange={(e) => setRootDirectory(e.target.value)}
                                placeholder="./"
                                className="input w-full"
                            />
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                Directory where your code lives
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            onClick={async () => {
                                if (!project) return;
                                setSaving(true);
                                const toastId = toast.loading('Saving settings...');
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
                                        toast.success('Settings saved', { id: toastId });
                                        fetchProject();
                                    } else {
                                        toast.error('Failed to save settings', { id: toastId });
                                    }
                                } catch (error) {
                                    console.error('Failed to save settings:', error);
                                    toast.error('Failed to save settings', { id: toastId });
                                } finally {
                                    setSaving(false);
                                }
                            }}
                            disabled={saving}
                            className="btn btn-primary"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Notifications */}
            <div className="card mt-8">
                <h2 className="text-lg font-semibold mb-4">Notifications</h2>
                <div className="space-y-4">
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
                            onClick={async () => {
                                if (!project) return;
                                setSavingWebhook(true);
                                const toastId = toast.loading('Saving webhook...');
                                try {
                                    const response = await fetch(`/api/projects/${project.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            webhookUrl,
                                        }),
                                    });

                                    if (response.ok) {
                                        toast.success('Webhook saved', { id: toastId });
                                        fetchProject();
                                    } else {
                                        toast.error('Failed to save webhook', { id: toastId });
                                    }
                                } catch (error) {
                                    console.error('Failed to save webhook:', error);
                                    toast.error('Failed to save webhook', { id: toastId });
                                } finally {
                                    setSavingWebhook(false);
                                }
                            }}
                            disabled={savingWebhook}
                            className="btn btn-primary"
                        >
                            {savingWebhook ? (
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
            </div>

            {/* Danger Zone */}
            <div className="card mt-8 border-red-500/30">
                <h2 className="text-lg font-semibold mb-4 text-red-400">Danger Zone</h2>
                <div className="flex items-center justify-between py-3">
                    <div>
                        <p className="font-medium">Delete Project</p>
                        <p className="text-sm text-[var(--muted-foreground)]">
                            Permanently delete this project and all its deployments
                        </p>
                    </div>
                    <button
                        onClick={handleDeleteProject}
                        className="btn border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                        Delete Project
                    </button>
                </div>
            </div>
        </div>
    );
}
