'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    ExternalLink,
    GitBranch,
    Github,
    RotateCcw,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
    AlertCircle,
    Copy,
    Check,
    FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { DeploymentLogsModal } from '@/components/DeploymentLogsModal';
import { RollbackModal } from '@/components/RollbackModal';
import { WebVitals } from '@/components/WebVitals';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'ready':
                return <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />;
            case 'error':
                return <AlertCircle className="w-4 h-4 text-[var(--error)]" />;
            case 'building':
            case 'deploying':
                return <Loader2 className="w-4 h-4 text-[var(--warning)] animate-spin" />;
            case 'queued':
                return <Clock className="w-4 h-4 text-[var(--info)]" />;
            default:
                return <AlertCircle className="w-4 h-4 text-[var(--muted)]" />;
        }
    };

    const formatDate = (date: Date) => {
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

    const handleRedeploy = async () => {
        if (!project) return;
        const toastId = toast.loading('Triggering deployment...');
        await redeployProject(project.id);
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

    const formatDuration = (ms?: number) => {
        if (!ms) return null;
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (minutes === 0) return `${remainingSeconds}s`;
        return `${minutes}m ${remainingSeconds}s`;
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
                    <Button
                        onClick={handleRedeploy}
                        disabled={deploying}
                        variant="secondary"
                        size="sm"
                        className="h-9"
                    >
                        {deploying ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                            <RotateCcw className="w-4 h-4 mr-2" />
                        )}
                        Redeploy
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
                        <Button
                            variant="primary"
                            size="sm"
                            className="h-9"
                            disabled={!project.productionUrl}
                        >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Visit
                        </Button>
                    </a>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Production Deployment & Stats */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Production Card */}
                    <Card className="overflow-hidden shadow-lg border-[var(--primary)]/10">
                        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--muted)]/5">
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Production Deployment</h2>
                            <Badge variant="success" className="animate-pulse">
                                <div className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
                                Live
                            </Badge>
                        </div>
                        <div className="p-8">
                            {project.productionUrl ? (
                                <div className="space-y-6">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-2">
                                            <p className="text-2xl font-bold tracking-tight text-[var(--foreground)] truncate max-w-md">
                                                {project.productionUrl.replace(/^https?:\/\//, '')}
                                            </p>
                                            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] bg-[var(--background)] px-3 py-1 rounded-full border border-[var(--border)] w-fit">
                                                <GitBranch className="w-3.5 h-3.5" />
                                                <span>Deployed from <span className="text-[var(--foreground)] font-mono font-medium">{project.defaultBranch}</span></span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleCopyUrl(project.productionUrl, 'production-url')}
                                            className="hover:bg-[var(--card-hover)] transition-colors group"
                                            title="Copy Production URL"
                                        >
                                            {copiedId === 'production-url' ? (
                                                <Check className="w-4 h-4 text-[var(--success)]" />
                                            ) : (
                                                <Copy className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
                                            )}
                                        </Button>
                                    </div>
                                    <div className="pt-6 flex items-center gap-6 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5" />
                                            <span>Active for {project.updatedAt ? formatDate(project.updatedAt) : 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Github className="w-3.5 h-3.5" />
                                            <span>{project.repoFullName}</span>
                                        </div>
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
                    <h2 className="text-xl font-semibold tracking-tight">Deployment History</h2>
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
                                <div key={deployment.id} className="p-4 md:p-6 hover:bg-[var(--card-hover)] transition-colors group">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            <div className="mt-1">
                                                {getStatusIcon(deployment.status)}
                                            </div>
                                            <div className="space-y-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-sm truncate max-w-md">
                                                        {deployment.gitCommitMessage}
                                                    </p>
                                                    <Badge
                                                        variant={deployment.type === 'production' ? 'success' : 'info'}
                                                        className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                                                    >
                                                        {deployment.type}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                                                    <div className="flex items-center gap-1 font-mono">
                                                        <span>{deployment.gitBranch}</span>
                                                        <span>@</span>
                                                        <span className="hover:text-[var(--foreground)] cursor-pointer" onClick={() => handleCopyUrl(deployment.gitCommitSha, `sha-${deployment.id}`)}>
                                                            {deployment.gitCommitSha.substring(0, 7)}
                                                        </span>
                                                        {copiedId === `sha-${deployment.id}` && <Check className="w-3 h-3 text-[var(--success)]" />}
                                                    </div>
                                                    <span>•</span>
                                                    <span>{formatDate(deployment.createdAt)}</span>
                                                    {deployment.buildDurationMs && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                {formatDuration(deployment.buildDurationMs)}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 pl-11 md:pl-0">
                                            {deployment.url && (
                                                <a
                                                    href={deployment.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs border border-[var(--border)] hover:bg-[var(--background)]">
                                                        <ExternalLink className="w-3.5 h-3.5 mr-1.5 text-[var(--muted-foreground)]" />
                                                        View
                                                    </Button>
                                                </a>
                                            )}

                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSelectedLogsId(deployment.id)}
                                        className="h-8 px-2.5 text-xs border border-[var(--border)] hover:bg-[var(--background)]"
                                            >
                                                <FileText className="w-3.5 h-3.5 mr-1.5 text-[var(--muted-foreground)]" />
                                                Logs
                                            </Button>

                                            {deployment.status === 'ready' && deployment.type === 'production' && deployment.cloudRunRevision && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRollback(deployment.id)}
                                            className="h-8 px-2.5 text-xs text-[var(--error)] border border-[var(--error)]/20 hover:bg-[var(--error-bg)]"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                                    Rollback
                                                </Button>
                                            )}

                                            {(deployment.status === 'queued' || deployment.status === 'building') && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleCancel(deployment.id)}
                                            className="h-8 px-2.5 text-xs text-[var(--error)] border border-[var(--error)]/20 hover:bg-[var(--error-bg)]"
                                                >
                                                    Cancel
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
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
