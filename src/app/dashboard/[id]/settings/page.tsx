'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Settings, Bell, Shield, AlertTriangle } from 'lucide-react';
import { EnvVariablesSection } from '@/components/EnvVariablesSection';
import { DomainsSection } from '@/components/DomainsSection';
import { RegionSettings } from '@/components/RegionSettings';
import { ResourceSettings } from '@/components/ResourceSettings';
import { BranchDeploymentsSettings } from '@/components/BranchDeploymentsSettings';
import { CronsSection } from '@/components/CronsSection';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { SettingsToggle } from '@/components/SettingsToggle';

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
        framework,
        webhookUrl,
        emailNotifications,
        autoDeployPrs,
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
            <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-8 w-48" />
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="overflow-hidden p-0">
                            <div className="p-6 flex items-center gap-3">
                                <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                                <div className="space-y-2">
                                    <Skeleton className="h-3 w-24" />
                                    <Skeleton className="h-5 w-40" />
                                </div>
                            </div>
                            <Separator />
                            <div className="p-6">
                                <Skeleton className="h-24 w-full rounded-xl" />
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
                <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--muted)]/10 flex items-center justify-center">
                        <Settings className="w-8 h-8 text-[var(--muted-foreground)]" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-[9px] md:text-[11px] font-bold">Project Not Found</h2>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                            The project you are looking for does not exist or you don&apos;t have access.
                        </p>
                    </div>
                    <Link href="/dashboard">
                        <Button variant="outline" className="text-[9px] font-bold uppercase tracking-wider">
                            Back to Dashboard
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            {/* Breadcrumb */}
            <Link
                href={`/dashboard/${project.id}`}
                className="inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to {project.name}
            </Link>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Settings className="w-8 h-8 text-[var(--primary)]" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Project Configuration</span>
                        <h1 className="text-[9px] md:text-[11px] font-bold tracking-tight">Project Settings</h1>
                    </div>
                </div>
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
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <Settings className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Build Settings</span>
                            <h3 className="text-[11px] font-bold">Configuration</h3>
                        </div>
                    </div>

                    <Separator className="bg-[var(--border)]" />

                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="framework" className="text-[11px] font-bold">Framework</Label>
                                <NativeSelect
                                    id="framework"
                                    value={framework}
                                    onChange={(e) => setProjectSettingsField('framework', e.target.value)}
                                >
                                    <option value="nextjs">NEXT.JS</option>
                                    <option value="vite">VITE</option>
                                    <option value="astro">ASTRO</option>
                                    <option value="remix">REMIX</option>
                                    <option value="nuxt">NUXT</option>
                                    <option value="sveltekit">SVELTEKIT</option>
                                    <option value="bun">BUN</option>
                                    <option value="docker">DOCKER</option>
                                </NativeSelect>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    The framework used for building. Use &quot;DOCKER&quot; to use your own Dockerfile.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="root-directory" className="text-[11px] font-bold">Root Directory</Label>
                                <Input
                                    id="root-directory"
                                    type="text"
                                    value={rootDirectory}
                                    onChange={(e) => setProjectSettingsField('rootDirectory', e.target.value)}
                                    placeholder="./"
                                    className="placeholder:text-[9px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    The directory within your project where code is located.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="build-command" className="text-[11px] font-bold">Build Command</Label>
                                <Input
                                    id="build-command"
                                    type="text"
                                    value={buildCommand}
                                    onChange={(e) => setProjectSettingsField('buildCommand', e.target.value)}
                                    placeholder="NPM RUN BUILD"
                                    className="placeholder:text-[9px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    The command used to build your project.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="output-directory" className="text-[11px] font-bold">Output Directory</Label>
                                <Input
                                    id="output-directory"
                                    type="text"
                                    value={outputDirectory}
                                    onChange={(e) => setProjectSettingsField('outputDirectory', e.target.value)}
                                    placeholder=".NEXT"
                                    className="placeholder:text-[9px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    The directory where build artifacts are located.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="install-command" className="text-[11px] font-bold">Install Command</Label>
                                <Input
                                    id="install-command"
                                    type="text"
                                    value={installCommand}
                                    onChange={(e) => setProjectSettingsField('installCommand', e.target.value)}
                                    placeholder="NPM INSTALL"
                                    className="placeholder:text-[9px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                />
                                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    The command used to install dependencies.
                                </p>
                            </div>
                        </div>

                        <Separator className="my-4" />

                        <SettingsToggle
                            id="auto-deploy-prs"
                            title="Automatic PR Deployments"
                            description="If enabled, every Pull Request will automatically trigger a new preview deployment. Disable this to save on server costs."
                            checked={autoDeployPrs}
                            onCheckedChange={(checked) => setProjectSettingsField('autoDeployPrs', checked)}
                        />

                        <div className="flex justify-end pt-2">
                            <MovingBorderButton
                                onClick={() => saveProjectSettings(project.id)}
                                loading={saving}
                                containerClassName="h-10 w-36"
                                className="text-[9px] font-bold uppercase tracking-wider"
                            >
                                Save Changes
                            </MovingBorderButton>
                        </div>
                    </div>
                </Card>

                {/* Branch Deployments */}
                <BranchDeploymentsSettings
                    projectId={project.id}
                    onUpdate={() => fetchProjectDetails(project.id)}
                />

                {/* Cron Jobs */}
                <CronsSection
                    projectId={project.id}
                    onUpdate={() => fetchProjectDetails(project.id)}
                />

                {/* Notifications */}
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <Bell className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Notifications</span>
                            <h3 className="text-[11px] font-bold">Alert Preferences</h3>
                        </div>
                    </div>

                    <Separator className="bg-[var(--border)]" />

                    <div className="p-6 space-y-6">
                        <SettingsToggle
                            id="email-notifications"
                            title="Email Notifications"
                            description="Receive email notifications when a deployment succeeds or fails."
                            checked={emailNotifications}
                            onCheckedChange={(checked) => setProjectSettingsField('emailNotifications', checked)}
                        />

                        <div className="space-y-2">
                            <Label htmlFor="webhook-url" className="text-[11px] font-bold">Webhook URL</Label>
                            <Input
                                id="webhook-url"
                                type="text"
                                value={webhookUrl}
                                onChange={(e) => setProjectSettingsField('webhookUrl', e.target.value)}
                                placeholder="HTTPS://DISCORD.COM/API/WEBHOOKS/..."
                                className="placeholder:text-[9px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                            />
                            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                Receive notifications when a build fails. Supports Discord, Slack, and other webhook-compatible services.
                            </p>
                        </div>

                        <div className="flex justify-end pt-2">
                            <MovingBorderButton
                                onClick={() => saveNotificationSettings(project.id)}
                                loading={savingWebhook}
                                containerClassName="h-10 w-36"
                                className="text-[9px] font-bold uppercase tracking-wider"
                            >
                                Save Preferences
                            </MovingBorderButton>
                        </div>
                    </div>
                </Card>

                {/* Security */}
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <Shield className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Security</span>
                            <h3 className="text-[11px] font-bold">Safety & Protection</h3>
                        </div>
                    </div>

                    <Separator className="bg-[var(--border)]" />

                    <div className="p-6 space-y-6">
                        <SettingsToggle
                            id="cloud-armor"
                            title="Cloud Armor WAF"
                            description="Enable Google Cloud Armor Web Application Firewall to protect against DDoS and web attacks."
                            checked={cloudArmorEnabled}
                            onCheckedChange={(checked) => setProjectSettingsField('cloudArmorEnabled', checked)}
                        />

                        <div className="flex justify-end pt-2">
                            <MovingBorderButton
                                onClick={() => saveSecuritySettings(project.id)}
                                loading={savingSecurity}
                                containerClassName="h-10 w-44"
                                className="text-[9px] font-bold uppercase tracking-wider"
                            >
                                Save Security Settings
                            </MovingBorderButton>
                        </div>
                    </div>
                </Card>

                {/* Danger Zone */}
                <Card className="border-[var(--error)]/30 bg-[var(--error)]/5 overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--error)]/10 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
                        </div>
                        <div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--error)]">Danger Zone</span>
                            <h3 className="text-[11px] font-bold text-[var(--error)]">Critical Actions</h3>
                        </div>
                    </div>

                    <Separator className="bg-[var(--error)]/20" />

                    <div className="p-6">
                        <div className="flex items-center justify-between p-4 border border-[var(--error)]/20 rounded-lg bg-[var(--background)]">
                        <div>
                            <p className="text-[11px] font-bold text-[var(--error)]">Delete Project</p>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                Permanently delete this project and all its deployments.
                            </p>
                        </div>
                            <Button
                                variant="ghost"
                                onClick={() => setIsDeleteModalOpen(true)}
                                className="text-[var(--error)] hover:bg-[var(--error)]/10 hover:text-[var(--error)] text-[9px] font-bold uppercase tracking-wider"
                            >
                                Delete Project
                            </Button>
                        </div>
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
