'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, GitBranch, Clock } from 'lucide-react';
import type { Project, Deployment } from '@/types';

interface ProjectWithDeployment extends Project {
    latestDeployment?: Deployment;
}

export default function DashboardPage() {
    const [projects, setProjects] = useState<ProjectWithDeployment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProjects() {
            try {
                const response = await fetch('/api/projects');
                const data = await response.json();
                setProjects(data.projects || []);
            } catch (error) {
                console.error('Failed to fetch projects:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchProjects();
    }, []);

    const getStatusBadge = (status?: string) => {
        switch (status) {
            case 'ready':
                return <span className="badge badge-success">● Ready</span>;
            case 'building':
            case 'deploying':
                return <span className="badge badge-warning">● Building</span>;
            case 'error':
                return <span className="badge badge-error">● Error</span>;
            case 'queued':
                return <span className="badge badge-info">● Queued</span>;
            default:
                return <span className="badge" style={{ background: 'var(--card)', color: 'var(--muted)' }}>● No deployments</span>;
        }
    };

    const formatDate = (date?: Date) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Projects</h1>
                    <p className="text-[var(--muted-foreground)] mt-1">
                        Manage your Next.js deployments
                    </p>
                </div>
                <Link href="/dashboard/new" className="btn btn-primary">
                    <Plus className="w-4 h-4" />
                    Add New
                </Link>
            </div>

            {/* Loading state */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="card animate-pulse">
                            <div className="h-4 bg-[var(--border)] rounded w-1/2 mb-4"></div>
                            <div className="h-3 bg-[var(--border)] rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-[var(--border)] rounded w-1/3"></div>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && projects.length === 0 && (
                <div className="card text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-[var(--gradient-subtle)] flex items-center justify-center mx-auto mb-4">
                        <GitBranch className="w-8 h-8 text-[var(--primary)]" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
                    <p className="text-[var(--muted-foreground)] mb-6 max-w-md mx-auto">
                        Import a Git repository to start deploying your Next.js applications.
                    </p>
                    <Link href="/dashboard/new" className="btn btn-primary">
                        <Plus className="w-4 h-4" />
                        Import Project
                    </Link>
                </div>
            )}

            {/* Projects grid */}
            {!loading && projects.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projects.map((project) => (
                        <Link
                            key={project.id}
                            href={`/dashboard/${project.id}`}
                            className="card group cursor-pointer"
                        >
                            {/* Project header */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold truncate group-hover:text-[var(--primary)] transition-colors">
                                        {project.name}
                                    </h3>
                                    <p className="text-sm text-[var(--muted-foreground)] truncate">
                                        {project.repoFullName}
                                    </p>
                                </div>
                                {getStatusBadge(project.latestDeployment?.status)}
                            </div>

                            {/* Production URL */}
                            {project.productionUrl && (
                                <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] mb-4">
                                    <ExternalLink className="w-4 h-4" />
                                    <span className="truncate">{project.productionUrl}</span>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                                    <GitBranch className="w-3.5 h-3.5" />
                                    {project.defaultBranch}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatDate(project.updatedAt)}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
