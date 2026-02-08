'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { EnvVariablesSection } from '@/components/EnvVariablesSection';
import { DomainsSection } from '@/components/DomainsSection';
import { RegionSettings } from '@/components/RegionSettings';
import { ResourceSettings } from '@/components/ResourceSettings';
import { BranchDeploymentsSettings } from '@/components/BranchDeploymentsSettings';
import { useStore } from '@/store';
import { Button } from '@/components/ui/moving-border';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';

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

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (params.id) {
            fetchProjectDetails(params.id as string);
        }
    }, [params.id, fetchProjectDetails]);

    const handleDeleteProject = async () => {
        if (!project) return;
        setIsDeleting(true);
        const success = await deleteProject(project.id);
        if (success) {
            router.push('/dashboard');
        } else {
            setIsDeleting(false);
            setIsDeleteModalOpen(false);
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
        <div className="p-8 max-w-4xl space-y-8">
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteProject}
                title="Delete Project"
                description={`Are you sure you want to delete ${project.name}? This action cannot be undone and will permanently delete all deployments and data.`}
                confirmText="Delete Project"
                variant="destructive"
                loading={isDeleting}
            />

            {/* Breadcrumb */}
            <Link
                href={`/dashboard/${project.id}`}
                className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to {project.name}
            </Link>

            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold mb-2">Project Settings</h1>
                <p className="text-[var(--muted-foreground)]">
                    Configure settings for <span className="font-semibold text-[var(--foreground)]">{project.name}</span>
                </p>
            </div>

            {/* Domains Section */}
            <DomainsSection
                projectId={project.id}
                productionUrl={project.productionUrl}
                onUpdate={() => fetchProjectDetails(project.id)}
            />

            {/* Environment Variables Section */}
            <EnvVariablesSection
                projectId={project.id}
                onUpdate={() => fetchProjectDetails(project.id)}
            />

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
            <div className="card">
                <h2 className="text-xl font-semibold mb-6">Build Settings</h2>
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="build-command" className="block text-sm font-medium mb-2">Build Command</label>
                            <input
                                id="build-command"
                                type="text"
                                value={buildCommand}
                                onChange={(e) => setProjectSettingsField('buildCommand', e.target.value)}
                                placeholder="npm run build"
                                className="input w-full"
                            />
                            <p className="text-xs text-[var(--muted-foreground)] mt-2">
                                Command to build your project
                            </p>
                        </div>
                        <div>
                            <label htmlFor="output-directory" className="block text-sm font-medium mb-2">Output Directory</label>
                            <input
                                id="output-directory"
                                type="text"
                                value={outputDirectory}
                                onChange={(e) => setProjectSettingsField('outputDirectory', e.target.value)}
                                placeholder=".next"
                                className="input w-full"
                            />
                            <p className="text-xs text-[var(--muted-foreground)] mt-2">
                                Directory where build artifacts are located
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="install-command" className="block text-sm font-medium mb-2">Install Command</label>
                            <input
                                id="install-command"
                                type="text"
                                value={installCommand}
                                onChange={(e) => setProjectSettingsField('installCommand', e.target.value)}
                                placeholder="npm install"
                                className="input w-full"
                            />
                            <p className="text-xs text-[var(--muted-foreground)] mt-2">
                                Command to install dependencies
                            </p>
                        </div>
                        <div>
                            <label htmlFor="root-directory" className="block text-sm font-medium mb-2">Root Directory</label>
                            <input
                                id="root-directory"
                                type="text"
                                value={rootDirectory}
                                onChange={(e) => setProjectSettingsField('rootDirectory', e.target.value)}
                                placeholder="./"
                                className="input w-full"
                            />
                            <p className="text-xs text-[var(--muted-foreground)] mt-2">
                                Directory where your code lives
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            onClick={() => saveProjectSettings(project.id)}
                            disabled={saving}
                            className="bg-[var(--primary)] text-[var(--primary-foreground)]"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Branch Deployments */}
            <BranchDeploymentsSettings
                projectId={project.id}
                onUpdate={() => fetchProjectDetails(project.id)}
            />

            {/* Notifications */}
            <div className="card">
                <h2 className="text-xl font-semibold mb-6">Notifications</h2>
                <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 border border-[var(--border)] rounded-xl bg-[var(--background)]/50">
                        <input
                            id="email-notifications"
                            type="checkbox"
                            checked={emailNotifications}
                            onChange={(e) => setProjectSettingsField('emailNotifications', e.target.checked)}
                            className="w-5 h-5 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                        />
                        <div>
                            <label htmlFor="email-notifications" className="block text-sm font-medium">
                                Email Notifications
                            </label>
                            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                Receive email notifications when a deployment succeeds or fails.
                            </p>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="webhook-url" className="block text-sm font-medium mb-2">Webhook URL</label>
                        <input
                            id="webhook-url"
                            type="text"
                            value={webhookUrl}
                            onChange={(e) => setProjectSettingsField('webhookUrl', e.target.value)}
                            placeholder="https://discord.com/api/webhooks/..."
                            className="input w-full"
                        />
                        <p className="text-xs text-[var(--muted-foreground)] mt-2">
                            Receive notifications when a build fails. Supports Discord, Slack, etc.
                        </p>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            onClick={() => saveNotificationSettings(project.id)}
                            disabled={savingWebhook}
                            className="bg-[var(--primary)] text-[var(--primary-foreground)]"
                        >
                            {savingWebhook ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Security */}
            <div className="card">
                <h2 className="text-xl font-semibold mb-6">Security</h2>
                <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 border border-[var(--border)] rounded-xl bg-[var(--background)]/50">
                        <input
                            id="cloud-armor"
                            type="checkbox"
                            checked={cloudArmorEnabled}
                            onChange={(e) => setProjectSettingsField('cloudArmorEnabled', e.target.checked)}
                            className="w-5 h-5 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                        />
                        <div>
                            <label htmlFor="cloud-armor" className="block text-sm font-medium">
                                Cloud Armor WAF
                            </label>
                            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                Enable Google Cloud Armor Web Application Firewall to protect against DDoS and web attacks.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            onClick={() => saveSecuritySettings(project.id)}
                            disabled={savingSecurity}
                            className="bg-[var(--primary)] text-[var(--primary-foreground)]"
                        >
                            {savingSecurity ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="card border-red-500/20 bg-red-500/5">
                <h2 className="text-xl font-semibold mb-6 text-red-500">Danger Zone</h2>
                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="font-medium text-[var(--foreground)]">Delete Project</p>
                        <p className="text-sm text-[var(--muted-foreground)] mt-1">
                            Permanently delete this project and all its deployments.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="px-4 py-2 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50 transition-all font-medium text-sm"
                    >
                        Delete Project
                    </button>
                </div>
            </div>
        </div>
    );
}
