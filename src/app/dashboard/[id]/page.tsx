'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    ExternalLink,
    GitBranch,
    Github,
    Globe,
    History,
    RotateCcw,
    Clock,
    Loader2,
    AlertCircle,
    Copy,
    Check,
    Layout,
    Activity,
    Database
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { DeploymentLogsModal } from '@/components/DeploymentLogsModal';
import { RollbackModal } from '@/components/RollbackModal';
import { DeploymentListItem } from '@/components/DeploymentListItem';
import { WebVitals } from '@/components/WebVitals';
import { ResourceAdvisor } from '@/components/ResourceAdvisor';
import { ShieldSecurity } from '@/components/ShieldSecurity';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';

export default function ProjectDetailPage() {
    const params = useParams();
    const {
        currentProject: project,
        currentDeployments: deployments,
        errorCount,
        isLoadingProject: loading,
        isRedeploying: deploying,
        selectedLogsId,
        setSelectedLogsId,
        rollbackDeployment,
        setRollbackDeployment,
        fetchProjectDetails,
        redeployProject,
        cancelDeployment
    } = useStore();

    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        if (params.id) {
            fetchProjectDetails(params.id as string);
        }
    }, [params.id, fetchProjectDetails]);

    const formatDate = (date: Date | string | number) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).toUpperCase();
    };

    const handleCopyUrl = async (url: string | undefined | null, id: string) => {
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            setCopiedId(id);
            toast.success('Copied to clipboard');
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy URL:', err);
            toast.error('Failed to copy URL');
        }
    };

    const handleRedeploy = async (force = false) => {
        if (!project) return;
        const toastId = toast.loading(force ? 'Triggering force redeploy (ignoring cache)...' : 'Triggering deployment...');
        await redeployProject(project.id, force);
        toast.success('Deployment triggered', { id: toastId });
    };

    const handleCancel = async (deploymentId: string) => {
        if (!project) return;
        const toastId = toast.loading('Cancelling deployment...');
        await cancelDeployment(project.id, deploymentId);
        toast.success('Deployment cancelled', { id: toastId });
    };

    const handleRollback = (deploymentId: string) => {
        const deployment = deployments.find(d => d.id === deploymentId);
        if (deployment) {
            setRollbackDeployment(deployment);
        }
    };

    const confirmRollback = async () => {
        if (!project || !rollbackDeployment || !rollbackDeployment.cloudRunRevision) return;
        const toastId = toast.loading('Initiating rollback...');
        try {
            const response = await fetch(`/api/projects/${project.id}/rollback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    revisionName: rollbackDeployment.cloudRunRevision,
                }),
            });

            if (response.ok) {
                toast.success('Rollback initiated', { id: toastId });
                fetchProjectDetails(project.id);
                setRollbackDeployment(null);
            } else {
                const err = await response.json();
                toast.error(err.error || 'Failed to rollback', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to rollback:', error);
            toast.error('Failed to rollback', { id: toastId });
        }
    };

    if (loading && !project) {
        return (
            <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                        <div className="space-y-1">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-8 w-48" />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Skeleton className="h-9 w-32 rounded-xl" />
                        <Skeleton className="h-9 w-24 rounded-xl" />
                    </div>
                </div>
                <Card className="overflow-hidden p-0">
                    <div className="p-6">
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                    <Separator />
                    <div className="p-8">
                        <Skeleton className="h-32 w-full rounded-xl" />
                    </div>
                </Card>
                <Card className="overflow-hidden p-0">
                    <div className="p-6">
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                    <Separator />
                    <div className="p-6 space-y-4">
                        <Skeleton className="h-24 w-full rounded-xl" />
                        <Skeleton className="h-24 w-full rounded-xl" />
                    </div>
                </Card>
            </div>
        );
    }

    if (!project) {
        return null;
    }

    const selectedDeployment = deployments.find(d => d.id === selectedLogsId);

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            {/* Project Header Info */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Layout className="w-8 h-8 text-[var(--primary)]" />
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Project Overview</span>
                            <span className="text-[var(--muted)]">•</span>
                            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                <a
                                    href={project.repoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                                >
                                    <Github className="w-3 h-3" />
                                    {project.repoFullName.toUpperCase()}
                                </a>
                                <span className="flex items-center gap-1">
                                    <GitBranch className="w-3 h-3" />
                                    {project.defaultBranch.toUpperCase()}
                                </span>
                            </div>
                        </div>
                        <h1 className="text-[11px] md:text-xs font-bold tracking-tight">{project.name}</h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <MovingBorderButton
                        onClick={() => handleRedeploy(false)}
                        disabled={deploying}
                        containerClassName="h-9 w-32"
                        className="text-[10px] font-bold uppercase tracking-wider"
                    >
                        {deploying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                        ) : (
                            <RotateCcw className="w-3.5 h-3.5 mr-2" />
                        )}
                        Redeploy
                    </MovingBorderButton>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRedeploy(true)}
                        disabled={deploying}
                        className="h-9 w-9 border border-[var(--border)]"
                        title="Force Redeploy (Ignore Cache)"
                    >
                        <AlertCircle className="w-4 h-4" />
                    </Button>
                    <a
                        href={project.productionUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            !project.productionUrl && "pointer-events-none"
                        )}
                        onClick={(e) => !project.productionUrl && e.preventDefault()}
                    >
                        <MovingBorderButton
                            containerClassName="h-9 w-24"
                            className="text-[10px] font-bold uppercase tracking-wider"
                            disabled={!project.productionUrl}
                        >
                            <ExternalLink className="w-3.5 h-3.5 mr-2" />
                            Visit
                        </MovingBorderButton>
                    </a>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Production Deployment & Stats */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Production Card */}
                    <Card className="overflow-hidden shadow-lg border-[var(--primary)]/10 bg-gradient-to-br from-[var(--card)] to-[var(--muted)]/5 p-0">
                        <div className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                    <Globe className="w-5 h-5 text-[var(--primary)]" />
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Environment</span>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-[11px] md:text-xs font-bold">Production</h2>
                                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider py-0 px-1.5 bg-[var(--background)]">
                                            {project.framework?.toUpperCase() || 'WEB APP'}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative flex h-2.5 w-2.5">
                                    <span className="animate-pulse-glow absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-40"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--success)] shadow-[0_0_10px_var(--success)]"></span>
                                </div>
                                <Badge
                                    variant="success"
                                    className="text-[10px] py-0.5 px-2 font-bold tracking-wider uppercase shadow-[0_0_10px_var(--success-bg)]"
                                >
                                    Live
                                </Badge>
                            </div>
                        </div>

                        <Separator className="bg-[var(--border)]" />

                        <div className="p-8">
                            {project.productionUrl ? (
                                <div className="space-y-6">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <p className="text-xs font-bold tracking-tight text-[var(--foreground)] truncate max-w-md group cursor-pointer hover:text-[var(--primary)] transition-colors" onClick={() => window.open(project.productionUrl!, '_blank')}>
                                                    {project.productionUrl.replace(/^https?:\/\//, '')}
                                                    <ExternalLink className="inline-block w-4 h-4 ml-2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--background)] px-3 py-1 rounded-full border border-[var(--border)] w-fit">
                                                    <GitBranch className="w-3 h-3" />
                                                <span>Branch: <span className="text-[var(--foreground)] font-mono text-[10px] font-bold uppercase tracking-wider">{project.defaultBranch.toUpperCase()}</span></span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--background)] px-3 py-1 rounded-full border border-[var(--border)] w-fit">
                                                    <Clock className="w-3 h-3" />
                                                    <span>Last Push: <span className="text-[var(--foreground)] text-[10px] font-bold uppercase tracking-wider">{formatDate(project.updatedAt)}</span></span>
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleCopyUrl(project.productionUrl, 'production-url')}
                                            className="hover:bg-[var(--card-hover)] transition-colors group h-10 w-10 border border-[var(--border)]"
                                            title="Copy Production URL"
                                        >
                                            {copiedId === 'production-url' ? (
                                                <Check className="w-4 h-4 text-[var(--success)]" />
                                            ) : (
                                                <Copy className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
                                            )}
                                        </Button>
                                    </div>
                                    <div className="pt-6 flex items-center justify-between border-t border-[var(--border)]">
                                        <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                            <div className="flex items-center gap-1.5">
                                                <Github className="w-3.5 h-3.5" />
                                                <span>{project.repoFullName.toUpperCase()}</span>
                                            </div>
                                            {project.region && (
                                                <div className="flex items-center gap-1.5">
                                                    <Globe className="w-3.5 h-3.5" />
                                                    <span className="uppercase">{project.region}</span>
                                                </div>
                                            )}
                                        </div>
                                        <Link href={`/dashboard/${params.id}/deployments`}>
                                            <Button variant="ghost" size="sm" className="text-[10px] font-bold h-7 text-[var(--primary)] hover:bg-[var(--primary)]/5 uppercase tracking-wider">
                                                View All Deploys
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 text-center space-y-3">
                                    <p className="text-[var(--muted-foreground)] text-[10px] font-bold uppercase tracking-wider">
                                        No production deployment yet. Push to {project.defaultBranch} to deploy.
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Right Column: Quick Stats / Alerts */}
                <div className="space-y-8">
                    {/* Infrastructure Health Widget */}
                    {project.storageConfigs && project.storageConfigs.length > 0 && (
                        <Card className="overflow-hidden p-0 shadow-sm border-[var(--primary)]/10">
                            <div className="p-6 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                        <Database className="w-5 h-5 text-[var(--primary)]" />
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Infrastructure</span>
                                        <h3 className="text-xs font-bold">Storage Health</h3>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {project.storageConfigs.every(s => (s.metadata?.health as { status: string })?.status === 'healthy' || s.status === 'provisioning') ? (
                                        <Badge variant="success" className="text-[10px] font-bold uppercase tracking-wider py-0 px-1.5 shadow-[0_0_8px_var(--success-bg)]">Operational</Badge>
                                    ) : project.storageConfigs.some(s => (s.metadata?.health as { status: string })?.status === 'unhealthy' || s.status === 'error') ? (
                                        <Badge variant="destructive" className="text-[10px] font-bold uppercase tracking-wider py-0 px-1.5 shadow-[0_0_8px_var(--error-bg)]">Unhealthy</Badge>
                                    ) : project.storageConfigs.some(s => (s.metadata?.health as { status: string })?.status === 'degraded') ? (
                                        <Badge variant="warning" className="text-[10px] font-bold uppercase tracking-wider py-0 px-1.5 shadow-[0_0_8px_var(--warning-bg)]">Degraded</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider py-0 px-1.5">Checking...</Badge>
                                    )}
                                </div>
                            </div>
                            <Separator className="bg-[var(--border)]" />
                            <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase">Resource Connectivity</span>
                                    <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase">
                                        {project.storageConfigs.filter(s => s.status === 'active' && (s.metadata?.health as { status: string })?.status === 'healthy').length}/{project.storageConfigs.length} UP
                                    </span>
                                </div>
                                {project.storageConfigs.slice(0, 3).map((storage) => {
                                    const health = storage.metadata?.health as { status: string; latency: number; error?: string } | undefined;
                                    const status = health?.status || (storage.status === 'provisioning' ? 'provisioning' : 'unknown');

                                    return (
                                        <div key={storage.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--muted)]/5 border border-[var(--border)] group hover:border-[var(--primary)]/30 transition-colors">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={cn(
                                                    "w-1.5 h-1.5 rounded-full shrink-0",
                                                    status === 'healthy' ? "bg-[var(--success)] shadow-[0_0_8px_var(--success)]" :
                                                    status === 'degraded' ? "bg-[var(--warning)] shadow-[0_0_8px_var(--warning)]" :
                                                    status === 'unhealthy' ? "bg-[var(--error)] shadow-[0_0_8px_var(--error)]" :
                                                    status === 'provisioning' ? "bg-[var(--info)] animate-pulse" :
                                                    "bg-[var(--muted-foreground)]/30"
                                                )} />
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[10px] font-bold uppercase truncate">{storage.name}</span>
                                                    <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] truncate">{storage.type.replace(/-/g, ' ')}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {(status === 'healthy' || status === 'degraded') && (
                                                    <span className={cn(
                                                        "text-[10px] font-mono font-bold",
                                                        status === 'healthy' ? "text-[var(--success)]" : "text-[var(--warning)]"
                                                    )}>
                                                        {health?.latency}ms
                                                    </span>
                                                )}
                                                {status === 'degraded' && (
                                                    <span className="text-[10px] font-bold text-[var(--warning)] uppercase">Slow</span>
                                                )}
                                                {status === 'unhealthy' && (
                                                    <span className="text-[10px] font-bold text-[var(--error)] uppercase">Failed</span>
                                                )}
                                                <Link href={`/dashboard/${project.id}/storage`}>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Activity className="w-3 h-3" />
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    );
                                })}
                                {project.storageConfigs.length > 3 && (
                                    <Link href={`/dashboard/${project.id}/storage`} className="block text-center pt-1">
                                        <span className="text-[10px] font-bold uppercase text-[var(--primary)] hover:underline">
                                            View all {project.storageConfigs.length} connectors
                                        </span>
                                    </Link>
                                )}
                            </div>
                        </Card>
                    )}

                    <ShieldSecurity projectId={project.id} />

                    {/* Compact Error Rate */}
                    {errorCount !== null && (
                        <Card className="overflow-hidden p-0 shadow-sm">
                            <div className="p-6 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                        <Activity className="w-5 h-5 text-[var(--primary)]" />
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">24h Status</span>
                                        <h3 className="text-xs font-bold">Vitals</h3>
                                    </div>
                                </div>
                                <AlertCircle className={cn(
                                    "w-5 h-5",
                                    errorCount > 0 ? "text-[var(--error)]" : "text-[var(--success)]"
                                )} />
                            </div>
                            <Separator className="bg-[var(--border)]" />
                            <div className="p-6 flex items-baseline gap-2">
                                <span className="text-xs font-bold">{errorCount}</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">events tracked</span>
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            <WebVitals metrics={deployments[0]?.performanceMetrics} />

            <ResourceAdvisor projectId={project.id} />

            {/* Deployment History */}
            <div className="space-y-6">
                {deployments.length === 0 ? (
                    <EmptyState
                        title="Ready to deploy"
                        icon={GitBranch}
                        description={
                            <span>
                                Push your code to <code className="px-1.5 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)] font-mono text-[10px] font-bold uppercase tracking-wider">{project.defaultBranch.toUpperCase()}</code> to trigger your first deployment.
                                We&apos;ll build and deploy your application automatically.
                            </span>
                        }
                    >
                        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--background)] px-4 py-2 rounded-lg border border-[var(--border)]">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[var(--success)] shadow-[0_0_8px_var(--success)]" />
                                Git Push
                            </span>
                            <span className="w-4 h-[1px] bg-[var(--border)]" />
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[var(--info)]" />
                                Build
                            </span>
                            <span className="w-4 h-[1px] bg-[var(--border)]" />
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />
                                Deploy
                            </span>
                        </div>
                    </EmptyState>
                ) : (
                    <Card className="overflow-hidden shadow-sm p-0">
                        <div className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                    <History className="w-5 h-5 text-[var(--primary)]" />
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Git Activity</span>
                                    <h2 className="text-[11px] md:text-xs font-bold">Deployment History</h2>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--background)] px-2 py-1 rounded border border-[var(--border)]">
                                    Showing {Math.min(deployments.length, 5)} of {deployments.length}
                                </span>
                            </div>
                        </div>

                        <Separator className="bg-[var(--border)]" />

                        <div className="divide-y divide-[var(--border)]">
                            {deployments.slice(0, 5).map((deployment) => (
                                <DeploymentListItem
                                    key={deployment.id}
                                    deployment={deployment}
                                    onCopy={handleCopyUrl}
                                    onRollback={handleRollback}
                                    onCancel={handleCancel}
                                    onViewLogs={setSelectedLogsId}
                                    copiedId={copiedId}
                                />
                            ))}
                        </div>
                        {deployments.length > 5 && (
                            <div className="px-6 py-3 bg-[var(--card)] border-t border-[var(--border)] text-center">
                                <Link
                                    href={`/dashboard/${params.id}/deployments`}
                                    className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                >
                                    View all deployments
                                </Link>
                            </div>
                        )}
                    </Card>
                )}
            </div>


            {project && selectedDeployment && (
                <DeploymentLogsModal
                    deployment={selectedDeployment}
                    isOpen={!!selectedLogsId}
                    onClose={() => setSelectedLogsId(null)}
                />
            )}

            {rollbackDeployment && (
                <RollbackModal
                    deployment={rollbackDeployment}
                    isOpen={!!rollbackDeployment}
                    onClose={() => setRollbackDeployment(null)}
                    onConfirm={confirmRollback}
                />
            )}
        </div>
    );
}
