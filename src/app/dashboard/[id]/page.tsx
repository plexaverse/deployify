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
    AlertCircle
} from 'lucide-react';
import type { Project, Deployment } from '@/types';

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [deployments, setDeployments] = useState<Deployment[]>([]);
    const [loading, setLoading] = useState(true);
    const [deploying, setDeploying] = useState(false);

    useEffect(() => {
        async function fetchProject() {
            try {
                const response = await fetch(`/api/projects/${params.id}`);

                if (!response.ok) {
                    router.push('/dashboard');
                    return;
                }

                const data = await response.json();
                setProject(data.project);
                setDeployments(data.deployments || []);
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

    const handleRedeploy = async () => {
        if (!project) return;

        setDeploying(true);
        try {
            const response = await fetch(`/api/projects/${project.id}/deploy`, {
                method: 'POST',
            });

            if (response.ok) {
                // Refresh deployments
                const projectResponse = await fetch(`/api/projects/${project.id}`);
                const data = await projectResponse.json();
                setDeployments(data.deployments || []);
            }
        } catch (error) {
            console.error('Failed to trigger deployment:', error);
        } finally {
            setDeploying(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <div className="animate-pulse">
                    <div className="h-6 bg-[var(--border)] rounded w-1/4 mb-4"></div>
                    <div className="h-4 bg-[var(--border)] rounded w-1/2 mb-8"></div>
                    <div className="card">
                        <div className="h-32 bg-[var(--border)] rounded"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (!project) {
        return null;
    }

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
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--background)]">
                        <div className="status-dot status-dot-ready"></div>
                        <div>
                            <p className="font-medium">{project.productionUrl}</p>
                            <p className="text-sm text-[var(--muted-foreground)]">
                                Deployed from {project.defaultBranch}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 rounded-lg bg-[var(--background)] text-center">
                        <p className="text-[var(--muted-foreground)]">
                            No production deployment yet. Push to {project.defaultBranch} to deploy.
                        </p>
                    </div>
                )}
            </div>

            {/* Deployments list */}
            <div className="card">
                <h2 className="font-semibold mb-4">Recent Deployments</h2>

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
                                    <div className="text-right">
                                        <span className={`badge ${deployment.type === 'production' ? 'badge-success' : 'badge-info'
                                            }`}>
                                            {deployment.type}
                                        </span>
                                        <p className="text-xs text-[var(--muted)] mt-1">
                                            {formatDate(deployment.createdAt)}
                                        </p>
                                    </div>
                                </div>
                                {deployment.url && (
                                    <a
                                        href={deployment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline mt-2 ml-7"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        {deployment.url}
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
