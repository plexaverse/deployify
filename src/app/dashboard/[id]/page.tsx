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
    Check
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { DeploymentLogsModal } from '@/components/DeploymentLogsModal';
import { RollbackModal } from '@/components/RollbackModal';
import { DeploymentListItem } from '@/components/DeploymentListItem';
import { WebVitals } from '@/components/WebVitals';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
        });
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
                <div className="space-y-2">
                    <Skeleton className="h-10 w-1/4" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
                <Card className="p-8">
                    <Skeleton className="h-32 w-full" />
                </Card>
                <Card className="p-6">
                    <Skeleton className="h-6 w-48 mb-6" />
                    <div className="space-y-4">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
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
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
                    <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
                        <a
                            href={project.repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 hover:text-[var(--foreground)] transition-colors"
                        >
                            <Github className="w-4 h-4" />
                            {project.repoFullName}
                        </a>
                        <span className="flex items-center gap-1.5">
                            <GitBranch className="w-4 h-4" />
                            {project.defaultBranch}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <MovingBorderButton
                        onClick={() => handleRedeploy(false)}
                        disabled={deploying}
                        containerClassName="h-9 w-32"
                        className="text-xs font-bold"
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
                            className="font-bold text-xs"
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
                    <Card className="overflow-hidden shadow-lg border-[var(--primary)]/10 bg-gradient-to-br from-[var(--card)] to-[var(--muted)]/5">
                        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--muted)]/10">
                            <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4 text-[var(--muted-foreground)]" />
                                <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Production Deployment</h2>
                                <Badge variant="outline" className="text-[10px] font-mono font-normal uppercase tracking-tight py-0 px-1.5 bg-[var(--background)]">
                                    {project.framework || 'Web App'}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative flex h-2.5 w-2.5">
                                    <span className="animate-pulse-glow absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-40"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--success)] shadow-[0_0_10px_var(--success)]"></span>
                                </div>
                                <Badge variant="success" className="text-[10px] py-0 px-2 font-bold tracking-wide uppercase shadow-[0_0_10px_var(--success-bg)]">
                                    Live
                                </Badge>
                            </div>
                        </div>
                        <div className="p-8">
                            {project.productionUrl ? (
                                <div className="space-y-6">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <p className="text-2xl font-bold tracking-tight text-[var(--foreground)] truncate max-w-md group cursor-pointer hover:text-[var(--primary)] transition-colors" onClick={() => window.open(project.productionUrl!, '_blank')}>
                                                    {project.productionUrl.replace(/^https?:\/\//, '')}
                                                    <ExternalLink className="inline-block w-4 h-4 ml-2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] bg-[var(--background)] px-3 py-1 rounded-full border border-[var(--border)] w-fit">
                                                    <GitBranch className="w-3.5 h-3.5" />
                                                    <span>Branch: <span className="text-[var(--foreground)] font-mono font-medium">{project.defaultBranch}</span></span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] bg-[var(--background)] px-3 py-1 rounded-full border border-[var(--border)] w-fit">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span>Last Push: <span className="text-[var(--foreground)] font-medium">{formatDate(project.updatedAt)}</span></span>
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
                                        <div className="flex items-center gap-6 text-[11px] text-[var(--muted-foreground)]">
                                            <div className="flex items-center gap-1.5">
                                                <Github className="w-3.5 h-3.5" />
                                                <span>{project.repoFullName}</span>
                                            </div>
                                            {project.region && (
                                                <div className="flex items-center gap-1.5">
                                                    <Globe className="w-3.5 h-3.5" />
                                                    <span className="uppercase">{project.region}</span>
                                                </div>
                                            )}
                                        </div>
                                        <Link href={`${params.id}/deployments`}>
                                            <Button variant="ghost" size="sm" className="text-xs font-medium h-7 text-[var(--primary)] hover:bg-[var(--primary)]/5">
                                                View All Deploys
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 text-center space-y-3">
                                    <p className="text-[var(--muted-foreground)] text-sm">
                                        No production deployment yet. Push to {project.defaultBranch} to deploy.
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Right Column: Quick Stats / Alerts */}
                <div className="space-y-8">
                    {/* Compact Error Rate */}
                    {errorCount !== null && (
                        <Card className="p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Errors (24h)</span>
                                <AlertCircle className={cn(
                                    "w-4 h-4",
                                    errorCount > 0 ? "text-[var(--error)]" : "text-[var(--success)]"
                                )} />
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold">{errorCount}</span>
                                <span className="text-xs text-[var(--muted-foreground)]">vitals tracked</span>
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            <WebVitals metrics={deployments[0]?.performanceMetrics} />

            {/* Deployment History */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                        <History className="w-5 h-5 text-[var(--primary)]" />
                        Deployment History
                    </h2>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--muted-foreground)]">Showing {deployments.length} deployments</span>
                    </div>
                </div>

                {deployments.length === 0 ? (
                    <EmptyState
                        title="Ready to deploy"
                        icon={GitBranch}
                        description={
                            <span>
                                Push your code to <code className="px-1.5 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)] font-mono text-xs">{project.defaultBranch}</code> to trigger your first deployment.
                                We&apos;ll build and deploy your application automatically.
                            </span>
                        }
                    >
                        <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)] bg-[var(--background)] px-4 py-2 rounded-lg border border-[var(--border)]">
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
                    <Card className="overflow-hidden shadow-sm">
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
                                    className="text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
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
