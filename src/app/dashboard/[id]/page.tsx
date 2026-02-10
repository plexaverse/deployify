'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    ExternalLink,
    GitBranch,
    Github,
    Settings,
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
import { Button } from '@/components/ui/moving-border';
import { DeploymentLogsModal } from '@/components/DeploymentLogsModal';
import { RollbackModal } from '@/components/RollbackModal';
import { ProjectAvatar } from '@/components/ProjectAvatar';
import { WebVitals } from '@/components/WebVitals';
import { useStore } from '@/store';
import type { Project, Deployment } from '@/types';

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
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
                return <XCircle className="w-4 h-4 text-[var(--error)]" />;
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
            <div className="p-8">
                <Skeleton className="h-8 w-1/4 mb-4" />
                <Skeleton className="h-5 w-1/2 mb-8" />
                <div className="card mb-8">
                    <Skeleton className="h-32 w-full" />
                </div>
                <div className="card">
                    <Skeleton className="h-6 w-48 mb-4" />
                    <Skeleton className="h-24 w-full mb-4" />
                    <Skeleton className="h-24 w-full" />
                </div>
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
                <div className="flex items-center gap-4">
                    <ProjectAvatar project={project} size={48} />
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
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRedeploy}
                        disabled={deploying}
                        className="btn btn-secondary h-9 text-sm"
                    >
                        {deploying ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                            <RotateCcw className="w-4 h-4 mr-2" />
                        )}
                        Redeploy
                    </button>
                    <a
                        href={project.productionUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            "btn btn-primary h-9 text-sm",
                            !project.productionUrl && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={(e) => !project.productionUrl && e.preventDefault()}
                    >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Visit
                    </a>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Production Deployment & Stats */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Production Card */}
                    <div className="border border-[var(--border)] rounded-xl bg-[var(--card)] overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Production Deployment</h2>
                            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Live
                            </span>
                        </div>
                        <div className="p-6">
                            {project.productionUrl ? (
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <p className="text-xl font-semibold truncate max-w-md">
                                                {project.productionUrl.replace(/^https?:\/\//, '')}
                                            </p>
                                            <p className="text-sm text-[var(--muted-foreground)]">
                                                Deployed from <span className="text-[var(--foreground)] font-mono">{project.defaultBranch}</span>
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleCopyUrl(project.productionUrl, 'production-url')}
                                            className="p-2 hover:bg-[var(--card-hover)] rounded-lg transition-colors group"
                                            title="Copy Production URL"
                                        >
                                            {copiedId === 'production-url' ? (
                                                <Check className="w-4 h-4 text-emerald-500" />
                                            ) : (
                                                <Copy className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
                                            )}
                                        </button>
                                    </div>
                                    <div className="pt-4 flex items-center gap-6 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5" />
                                            <span>Just now</span>
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
                    </div>
                </div>

                {/* Right Column: Quick Stats / Alerts */}
                <div className="space-y-8">
                    {/* Compact Error Rate */}
                    {errorCount !== null && (
                        <div className="border border-[var(--border)] rounded-xl p-6 bg-[var(--card)] shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Errors (24h)</span>
                                <AlertCircle className={cn(
                                    "w-4 h-4",
                                    errorCount > 0 ? "text-red-500" : "text-emerald-500"
                                )} />
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold">{errorCount}</span>
                                <span className="text-xs text-[var(--muted-foreground)]">vitals tracked</span>
                            </div>
                        </div>
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
                    <div className="border border-dashed border-[var(--border)] rounded-xl py-16 px-6 text-center flex flex-col items-center justify-center bg-[var(--muted)]/5">
                        <div className="w-20 h-20 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-6 shadow-sm relative">
                            <div className="absolute inset-0 bg-blue-500/5 rounded-full animate-pulse-glow" />
                            <GitBranch className="w-10 h-10 text-[var(--muted-foreground)] opacity-50" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">Ready to deploy</h3>
                        <p className="text-[var(--muted-foreground)] max-w-md mb-8 leading-relaxed">
                            Push your code to <code className="px-1.5 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)] font-mono text-xs">{project.defaultBranch}</code> to trigger your first deployment.
                            We&apos;ll build and deploy your application automatically.
                        </p>
                        <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)] bg-[var(--background)] px-4 py-2 rounded-lg border border-[var(--border)]">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                Git Push
                            </span>
                            <span className="w-4 h-[1px] bg-[var(--border)]" />
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                Build
                            </span>
                            <span className="w-4 h-[1px] bg-[var(--border)]" />
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />
                                Deploy
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="border border-[var(--border)] rounded-xl bg-[var(--card)] overflow-hidden shadow-sm">
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
                                                    <span className={cn(
                                                        "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                                                        deployment.type === 'production'
                                                            ? "bg-emerald-500/10 text-emerald-500"
                                                            : "bg-blue-500/10 text-blue-500"
                                                    )}>
                                                        {deployment.type}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                                                    <div className="flex items-center gap-1 font-mono">
                                                        <span>{deployment.gitBranch}</span>
                                                        <span>@</span>
                                                        <span className="hover:text-[var(--foreground)] cursor-pointer" onClick={() => handleCopyUrl(deployment.gitCommitSha, `sha-${deployment.id}`)}>
                                                            {deployment.gitCommitSha.substring(0, 7)}
                                                        </span>
                                                        {copiedId === `sha-${deployment.id}` && <Check className="w-3 h-3 text-emerald-500" />}
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
                                                    className="btn btn-ghost h-8 px-2.5 text-xs border border-[var(--border)] hover:border-[var(--foreground)]"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5 mr-1.5 text-[var(--muted-foreground)]" />
                                                    View
                                                </a>
                                            )}

                                            <button
                                                onClick={() => setSelectedLogsId(deployment.id)}
                                                className="btn btn-ghost h-8 px-2.5 text-xs border border-[var(--border)] hover:border-[var(--foreground)]"
                                            >
                                                <FileText className="w-3.5 h-3.5 mr-1.5 text-[var(--muted-foreground)]" />
                                                Logs
                                            </button>

                                            {deployment.status === 'ready' && deployment.type === 'production' && deployment.cloudRunRevision && (
                                                <button
                                                    onClick={() => handleRollback(deployment.id)}
                                                    className="btn btn-ghost h-8 px-2.5 text-xs text-red-500 border border-red-500/20 hover:bg-red-500/10"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                                    Rollback
                                                </button>
                                            )}

                                            {(deployment.status === 'queued' || deployment.status === 'building') && (
                                                <button
                                                    onClick={() => handleCancel(deployment.id)}
                                                    className="btn btn-ghost h-8 px-2.5 text-xs text-red-500 border border-red-500/20 hover:bg-red-500/10"
                                                >
                                                    Cancel
                                                </button>
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
                    </div>
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
