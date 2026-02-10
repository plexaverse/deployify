'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { EnvVariablesSection } from '@/components/EnvVariablesSection';
import { DomainsSection } from '@/components/DomainsSection';
import { RegionSettings } from '@/components/RegionSettings';
import { ResourceSettings } from '@/components/ResourceSettings';
import { BranchDeploymentsSettings } from '@/components/BranchDeploymentsSettings';
import { AuditLogViewer } from '@/components/AuditLogViewer';
import { useStore } from '@/store';

export default function ProjectSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const {
        currentProject: project,
        isLoadingProject: loading,
        buildCommand,
        installCommand,
        rootDirectory,
        outputDirectory,
        webhookUrl,
        emailNotifications,
        cloudArmorEnabled,
        isSavingProjectSettings: saving,
        isSavingWebhook: savingWebhook,
        isSavingSecurity: savingSecurity,
        setProjectSettingsField,
        fetchProjectDetails,
        saveProjectSettings,
        saveNotificationSettings,
        saveSecuritySettings,
        deleteProject
    } = useStore();

    useEffect(() => {
        if (params.id) {
            fetchProjectDetails(params.id as string);
        }
    }, [params.id, fetchProjectDetails]);

    const handleDeleteProject = async () => {
        if (!project) return;
        const success = await deleteProject(project.id);
        if (success) {
            router.push('/dashboard');
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
                productionUrl={project.productionUrl}
                onUpdate={() => fetchProjectDetails(project.id)}
            />

            {/* Environment Variables Section */}
            <div className="mt-8">
                <EnvVariablesSection
                    projectId={project.id}
                    onUpdate={() => fetchProjectDetails(project.id)}
                />
            </div>

            {/* Region Settings */}
            <RegionSettings
                projectId={project.id}
                onUpdate={() => fetchProjectDetails(project.id)}
            />

            {/* Resource Settings */}
            <ResourceSettings
                projectId={project.id}
                onUpdate={() => fetchProjectDetails(project.id)}
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
                                onChange={(e) => setProjectSettingsField('buildCommand', e.target.value)}
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
                                onChange={(e) => setProjectSettingsField('outputDirectory', e.target.value)}
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
                                onChange={(e) => setProjectSettingsField('installCommand', e.target.value)}
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
                                onChange={(e) => setProjectSettingsField('rootDirectory', e.target.value)}
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
                            onClick={() => saveProjectSettings(project.id)}
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

            {/* Branch Deployments */}
            <BranchDeploymentsSettings
                projectId={project.id}
                onUpdate={() => fetchProjectDetails(project.id)}
            />

            {/* Notifications */}
            <div className="card mt-8">
                <h2 className="text-lg font-semibold mb-4">Notifications</h2>
                <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 border border-[var(--border)] rounded-md bg-[var(--background)]">
                        <input
                            id="email-notifications"
                            type="checkbox"
                            checked={emailNotifications}
                            onChange={(e) => setProjectSettingsField('emailNotifications', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
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
                            onChange={(e) => setProjectSettingsField('webhookUrl', e.target.value)}
                            placeholder="https://discord.com/api/webhooks/..."
                            className="input w-full"
                        />
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Receive notifications when a build fails. Supports Discord, Slack, etc.
                        </p>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            onClick={() => saveNotificationSettings(project.id)}
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

            {/* Security */}
            <div className="card mt-8">
                <h2 className="text-lg font-semibold mb-4">Security</h2>
                <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 border border-[var(--border)] rounded-md bg-[var(--background)]">
                        <input
                            id="cloud-armor"
                            type="checkbox"
                            checked={cloudArmorEnabled}
                            onChange={(e) => setProjectSettingsField('cloudArmorEnabled', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
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
                        <button
                            onClick={() => saveSecuritySettings(project.id)}
                            disabled={savingSecurity}
                            className="btn btn-primary"
                        >
                            {savingSecurity ? (
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

            {/* Audit Logs */}
            <div className="mt-8">
                <AuditLogViewer projectId={project.id} />
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
