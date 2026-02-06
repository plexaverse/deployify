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
import { Skeleton } from '@/components/ui/skeleton';
import { DeploymentLogsModal } from '@/components/DeploymentLogsModal';
import { LogViewer } from '@/components/LogViewer';
import { RollbackModal } from '@/components/RollbackModal';
import { WebVitals } from '@/components/WebVitals';
import type { Project, Deployment } from '@/types';

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [deployments, setDeployments] = useState<Deployment[]>([]);
    const [errorCount, setErrorCount] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [deploying, setDeploying] = useState(false);
    const [selectedLogsId, setSelectedLogsId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [rollbackDeployment, setRollbackDeployment] = useState<Deployment | null>(null);

    useEffect(() => {
        async function fetchProject() {
            try {
                const [projectResponse, deploymentsResponse, statsResponse] = await Promise.all([
                    fetch(`/api/projects/${params.id}`),
                    fetch(`/api/projects/${params.id}/deployments`),
                    fetch(`/api/projects/${params.id}/logs/stats`)
                ]);

                if (!projectResponse.ok) {
                    router.push('/dashboard');
                    return;
                }

                const projectData = await projectResponse.json();
                setProject(projectData.project);

                if (deploymentsResponse.ok) {
                    const deploymentsData = await deploymentsResponse.json();
                    setDeployments(deploymentsData.deployments || []);
                } else {
                    setDeployments(projectData.deployments || []);
                }

                if (statsResponse.ok) {
                    const statsData = await statsResponse.json();
                    setErrorCount(statsData.errorCount);
                }
            } catch (error) {
                console.error('Failed to fetch project:', error);
            } finally {
                setLoading(false);
            }
        }

        if (params.id) {
            fetchProject();
        }
    }, [params.id, router]);

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

        setDeploying(true);
        const toastId = toast.loading('Triggering deployment...');
        try {
            const response = await fetch(`/api/projects/${project.id}/deploy`, {
                method: 'POST',
            });

            if (response.ok) {
                toast.success('Deployment triggered', { id: toastId });
                // Refresh deployments
                const deploymentsResponse = await fetch(`/api/projects/${project.id}/deployments`);
                const data = await deploymentsResponse.json();
                setDeployments(data.deployments || []);
            } else {
                toast.error('Failed to trigger deployment', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to trigger deployment:', error);
            toast.error('Failed to trigger deployment', { id: toastId });
        } finally {
            setDeploying(false);
        }
    };

    const handleCancel = async (deploymentId: string) => {
        if (!project) return;
        const toastId = toast.loading('Cancelling deployment...');
        try {
            const response = await fetch(`/api/projects/${project.id}/deploy?deploymentId=${deploymentId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success('Deployment cancelled', { id: toastId });
                // Refresh deployments
                const deploymentsResponse = await fetch(`/api/projects/${project.id}/deployments`);
                const data = await deploymentsResponse.json();
                setDeployments(data.deployments || []);
            } else {
                toast.error('Failed to cancel deployment', { id: toastId });
            }
        } catch (error) {
            console.error('Failed to cancel deployment:', error);
            toast.error('Failed to cancel deployment', { id: toastId });
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
                // Refresh deployments
                const deploymentsResponse = await fetch(`/api/projects/${project.id}/deployments`);
                const data = await deploymentsResponse.json();
                setDeployments(data.deployments || []);
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

    if (loading) {
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
        <div className="p-8">
            {/* Breadcrumb */}
            <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to projects
            </Link>

            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold mb-1">{project.name}</h1>
                    <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
                        <a
                            href={project.repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-[var(--foreground)]"
                        >
                            <Github className="w-4 h-4" />
                            {project.repoFullName}
                        </a>
                        <span className="flex items-center gap-1">
                            <GitBranch className="w-4 h-4" />
                            {project.defaultBranch}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRedeploy}
                        disabled={deploying}
                        className="btn btn-secondary"
                    >
                        {deploying ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RotateCcw className="w-4 h-4" />
                        )}
                        Redeploy
                    </button>
                    <Link href={`/dashboard/${project.id}/settings`} className="btn btn-ghost">
                        <Settings className="w-4 h-4" />
                        Settings
                    </Link>
                </div>
            </div>

            {/* Error Rate Card */}
            {errorCount !== null && (
                <div className="card mb-8 p-4 flex items-center gap-4">
                    <div className={`p-3 rounded-full ${errorCount > 0 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-[var(--muted-foreground)]">Error Rate (24h)</p>
                        <p className="text-2xl font-bold">{errorCount}</p>
                    </div>
                </div>
            )}

            {/* Production deployment card */}
            <div className="card mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold">Production Deployment</h2>
                    {project.productionUrl && (
                        <a
                            href={project.productionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Visit
                        </a>
                    )}
                </div>

                {project.productionUrl ? (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--background)]">
                        <div className="flex items-center gap-3">
                            <div className="status-dot status-dot-ready"></div>
                            <div>
                                <p className="font-medium">{project.productionUrl}</p>
                                <p className="text-sm text-[var(--muted-foreground)]">
                                    Deployed from {project.defaultBranch}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleCopyUrl(project.productionUrl, 'production-url')}
                            className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card-hover)] rounded-md transition-all flex items-center gap-2 text-sm"
                            aria-label={copiedId === 'production-url' ? "Production URL copied" : "Copy production URL"}
                        >
                            {copiedId === 'production-url' ? (
                                <Check className="w-4 h-4 text-[var(--success)]" />
                            ) : (
                                <Copy className="w-4 h-4" />
                            )}
                            <span>{copiedId === 'production-url' ? 'Copied' : 'Copy'}</span>
                        </button>
                    </div>
                ) : (
                    <div className="p-4 rounded-lg bg-[var(--background)] text-center">
                        <p className="text-[var(--muted-foreground)]">
                            No production deployment yet. Push to {project.defaultBranch} to deploy.
                        </p>
                    </div>
                )}
            </div>

            <WebVitals metrics={deployments[0]?.performanceMetrics} />

            {/* Deployments list */}
            <div className="card">
                <h2 className="font-semibold mb-4">Deployment History</h2>

                {deployments.length === 0 ? (
                    <div className="p-8 text-center text-[var(--muted-foreground)]">
                        No deployments yet
                    </div>
                ) : (
                    <div className="divide-y divide-[var(--border)]">
                        {deployments.map((deployment) => (
                            <div key={deployment.id} className="py-4 first:pt-0 last:pb-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {getStatusIcon(deployment.status)}
                                        <div>
                                            <p className="font-medium text-sm">
                                                {deployment.gitCommitMessage.substring(0, 50)}
                                                {deployment.gitCommitMessage.length > 50 ? '...' : ''}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                                                <span>{deployment.gitBranch}</span>
                                                <span>•</span>
                                                <span>{deployment.gitCommitSha.substring(0, 7)}</span>
                                                <span>•</span>
                                                <span>{deployment.gitCommitAuthor}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-1">
                                        <span className={`badge ${deployment.type === 'production' ? 'badge-success' : 'badge-info'
                                            }`}>
                                            {deployment.type}
                                        </span>
                                        <div className="flex items-center gap-3 text-xs text-[var(--muted)] mt-1">
                                            {deployment.buildDurationMs && (
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDuration(deployment.buildDurationMs)}
                                                </span>
                                            )}
                                            <span>{formatDate(deployment.createdAt)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            {(deployment.status === 'queued' || deployment.status === 'building') && (
                                                <button
                                                    onClick={() => handleCancel(deployment.id)}
                                                    className="text-xs px-2 py-1 rounded bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            )}

                                            <button
                                                onClick={() => setSelectedLogsId(deployment.id)}
                                                className="text-xs px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--secondary)]/80 transition-colors flex items-center gap-1"
                                            >
                                                <FileText className="w-3 h-3" />
                                                Logs
                                            </button>

                                            {deployment.status === 'ready' && deployment.type === 'production' && deployment.cloudRunRevision && (
                                                <button
                                                    onClick={() => handleRollback(deployment.id)}
                                                    className="text-xs px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--secondary)]/80 transition-colors flex items-center gap-1"
                                                    title="Rollback to this version"
                                                >
                                                    <RotateCcw className="w-3 h-3" />
                                                    Rollback
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 mt-2 ml-7">
                                    {deployment.url && (
                                        <>
                                            <a
                                                href={deployment.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                                {deployment.url}
                                            </a>
                                            <button
                                                onClick={() => handleCopyUrl(deployment.url, deployment.id)}
                                                className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                aria-label={copiedId === deployment.id ? "URL copied" : "Copy URL"}
                                            >
                                                {copiedId === deployment.id ? (
                                                    <Check className="w-3 h-3 text-[var(--success)]" />
                                                ) : (
                                                    <Copy className="w-3 h-3" />
                                                )}
                                                {copiedId === deployment.id ? 'URL copied' : 'Copy URL'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Runtime Logs */}
            <LogViewer projectId={project.id} className="mt-8" key={project.id} />

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
