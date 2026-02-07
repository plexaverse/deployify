'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
    CheckCircle2,
    XCircle,
    Loader2,
    Clock,
    AlertCircle,
    ExternalLink,
    FileText,
    RotateCcw,
    Check,
    Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { DeploymentLogsModal } from '@/components/DeploymentLogsModal';
import { RollbackModal } from '@/components/RollbackModal';
import { useStore } from '@/store';
import type { Deployment, Project } from '@/types';

export default function DeploymentsPage() {
    const params = useParams();
    const {
        currentProject: project,
        currentDeployments: deployments,
        isLoadingProject: loading,
        fetchProjectDetails,
        selectedLogsId,
        setSelectedLogsId,
        rollbackDeployment,
        setRollbackDeployment,
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
                return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'error':
                return <XCircle className="w-4 h-4 text-red-500" />;
            case 'building':
            case 'deploying':
                return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
            case 'queued':
                return <Clock className="w-4 h-4 text-[var(--muted-foreground)]" />;
            default:
                return <AlertCircle className="w-4 h-4 text-[var(--muted-foreground)]" />;
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
            toast.error('Failed to copy');
        }
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

    const handleCancel = async (deploymentId: string) => {
        if (!project) return;
        const toastId = toast.loading('Cancelling deployment...');
        await cancelDeployment(project.id, deploymentId);
        toast.success('Deployment cancelled', { id: toastId });
    };

    if (loading && !project) {
        return (
            <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-6">
                <Skeleton className="h-8 w-48 mb-6" />
                <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-24 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (!project) return null;

    const selectedDeployment = deployments.find(d => d.id === selectedLogsId);

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold tracking-tight">Deployments</h1>
                <p className="text-[var(--muted-foreground)] text-sm">
                    A history of all deployments for this project.
                </p>
            </div>

            {deployments.length === 0 ? (
                <div className="border border-dashed border-[var(--border)] rounded-xl p-12 text-center">
                    <p className="text-[var(--muted-foreground)] text-sm">No deployments found</p>
                </div>
            ) : (
                <div className="border border-[var(--border)] rounded-xl bg-[var(--card)] overflow-hidden shadow-sm">
                    <div className="divide-y divide-[var(--border)]">
                        {deployments.map((deployment) => (
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
                                                    <span
                                                        className="hover:text-[var(--foreground)] cursor-pointer"
                                                        onClick={() => handleCopyUrl(deployment.gitCommitSha, `sha-${deployment.id}`)}
                                                    >
                                                        {deployment.gitCommitSha.substring(0, 7)}
                                                    </span>
                                                    {copiedId === `sha-${deployment.id}` && <Check className="w-3 h-3 text-emerald-500" />}
                                                </div>
                                                <span>•</span>
                                                <span>{formatDate(deployment.createdAt)}</span>
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
                </div>
            )}

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
