'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { EnvVariablesSection } from '@/components/EnvVariablesSection';
import { DomainsSection } from '@/components/DomainsSection';
import { RegionSettings } from '@/components/RegionSettings';
import { ResourceSettings } from '@/components/ResourceSettings';
import { BranchDeploymentsSettings } from '@/components/BranchDeploymentsSettings';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
        setIsDeleting(false);
        if (success) {
            setIsDeleteModalOpen(false);
            router.push('/dashboard');
        }
    };

    if (loading) {
        return (
            <div className="p-8 max-w-4xl mx-auto space-y-8">
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-48" />
                 </div>
                 <Skeleton className="h-[200px] w-full rounded-xl" />
                 <Skeleton className="h-[200px] w-full rounded-xl" />
            </div>
        );
    }

    if (!project) {
        return null;
    }

    return (
        <div className="p-8 max-w-4xl mx-auto pb-24">
            {/* Breadcrumb */}
            <Link
                href={`/dashboard/${project.id}`}
                className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to {project.name}
            </Link>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2 tracking-tight">Project Settings</h1>
                <p className="text-[var(--muted-foreground)] text-lg">
                    Configure settings for <span className="font-semibold text-[var(--foreground)]">{project.name}</span>
                </p>
            </div>

            <div className="space-y-8">
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
                <Card>
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold mb-1">Build Settings</h2>
                        <p className="text-sm text-[var(--muted-foreground)]">
                            Configure how your project is built and deployed.
                        </p>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="build-command">Build Command</Label>
                                <Input
                                    id="build-command"
                                    type="text"
                                    value={buildCommand}
                                    onChange={(e) => setProjectSettingsField('buildCommand', e.target.value)}
                                    placeholder="npm run build"
                                />
                                <p className="text-xs text-[var(--muted-foreground)]">
                                    The command used to build your project.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="output-directory">Output Directory</Label>
                                <Input
                                    id="output-directory"
                                    type="text"
                                    value={outputDirectory}
                                    onChange={(e) => setProjectSettingsField('outputDirectory', e.target.value)}
                                    placeholder=".next"
                                />
                                <p className="text-xs text-[var(--muted-foreground)]">
                                    The directory where build artifacts are located.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="install-command">Install Command</Label>
                                <Input
                                    id="install-command"
                                    type="text"
                                    value={installCommand}
                                    onChange={(e) => setProjectSettingsField('installCommand', e.target.value)}
                                    placeholder="npm install"
                                />
                                <p className="text-xs text-[var(--muted-foreground)]">
                                    The command used to install dependencies.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="root-directory">Root Directory</Label>
                                <Input
                                    id="root-directory"
                                    type="text"
                                    value={rootDirectory}
                                    onChange={(e) => setProjectSettingsField('rootDirectory', e.target.value)}
                                    placeholder="./"
                                />
                                <p className="text-xs text-[var(--muted-foreground)]">
                                    The directory within your project where code is located.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button
                                onClick={() => saveProjectSettings(project.id)}
                                loading={saving}
                            >
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Branch Deployments */}
                <BranchDeploymentsSettings
                    projectId={project.id}
                    onUpdate={() => fetchProjectDetails(project.id)}
                />

                {/* Notifications */}
                <Card>
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold mb-1">Notifications</h2>
                        <p className="text-sm text-[var(--muted-foreground)]">
                            Manage how you receive alerts about your deployments.
                        </p>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-start gap-3 p-4 border border-[var(--border)] rounded-md bg-[var(--background)]">
                            <input
                                id="email-notifications"
                                type="checkbox"
                                checked={emailNotifications}
                                onChange={(e) => setProjectSettingsField('emailNotifications', e.target.checked)}
                                className="mt-1 w-4 h-4 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                            />
                            <div>
                                <Label htmlFor="email-notifications" className="text-base font-medium cursor-pointer">
                                    Email Notifications
                                </Label>
                                <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                    Receive email notifications when a deployment succeeds or fails.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="webhook-url">Webhook URL</Label>
                            <Input
                                id="webhook-url"
                                type="text"
                                value={webhookUrl}
                                onChange={(e) => setProjectSettingsField('webhookUrl', e.target.value)}
                                placeholder="https://discord.com/api/webhooks/..."
                            />
                            <p className="text-xs text-[var(--muted-foreground)]">
                                Receive notifications when a build fails. Supports Discord, Slack, and other webhook-compatible services.
                            </p>
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button
                                onClick={() => saveNotificationSettings(project.id)}
                                loading={savingWebhook}
                            >
                                Save Preferences
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Security */}
                <Card>
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold mb-1">Security</h2>
                        <p className="text-sm text-[var(--muted-foreground)]">
                             Configure security features for your deployments.
                        </p>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-start gap-3 p-4 border border-[var(--border)] rounded-md bg-[var(--background)]">
                            <input
                                id="cloud-armor"
                                type="checkbox"
                                checked={cloudArmorEnabled}
                                onChange={(e) => setProjectSettingsField('cloudArmorEnabled', e.target.checked)}
                                className="mt-1 w-4 h-4 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                            />
                            <div>
                                <Label htmlFor="cloud-armor" className="text-base font-medium cursor-pointer">
                                    Cloud Armor WAF
                                </Label>
                                <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                    Enable Google Cloud Armor Web Application Firewall to protect against DDoS and web attacks.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button
                                onClick={() => saveSecuritySettings(project.id)}
                                loading={savingSecurity}
                            >
                                Save Security Settings
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Danger Zone */}
                <Card className="border-[var(--error)]/30 bg-[var(--error-bg)]/5">
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold mb-1 text-[var(--error)]">Danger Zone</h2>
                        <p className="text-sm text-[var(--muted-foreground)]">
                            Irreversible and destructive actions.
                        </p>
                    </div>

                    <div className="flex items-center justify-between p-4 border border-[var(--error)]/20 rounded-lg bg-[var(--background)]">
                        <div>
                            <p className="font-medium">Delete Project</p>
                            <p className="text-sm text-[var(--muted-foreground)]">
                                Permanently delete this project and all its deployments.
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            onClick={() => setIsDeleteModalOpen(true)}
                            className="text-[var(--error)] hover:bg-[var(--error-bg)] hover:text-[var(--error)]"
                        >
                            Delete Project
                        </Button>
                    </div>
                </Card>
            </div>

            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteProject}
                title="Delete Project"
                description={
                    <span>
                        Are you sure you want to delete <strong>{project.name}</strong>? This action cannot be undone and will permanently delete all deployments, domains, and environment variables associated with this project.
                    </span>
                }
                confirmText="Delete Project"
                variant="destructive"
                loading={isDeleting}
            />
        </div>
    );
}
