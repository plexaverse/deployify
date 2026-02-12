'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, GitBranch, Clock, Search, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingGuide } from '@/components/OnboardingGuide';
import { EmptyState } from '@/components/EmptyState';
import type { Project, Deployment } from '@/types';
import { useTeam } from '@/contexts/TeamContext';

interface ProjectWithDeployment extends Project {
    latestDeployment?: Deployment;
}

export default function DashboardPage() {
    const [projects, setProjects] = useState<ProjectWithDeployment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [isMac, setIsMac] = useState(false);
    const { activeTeam, isLoading: isTeamLoading } = useTeam();

    useEffect(() => {
        setIsMac(navigator.userAgent.indexOf('Mac') !== -1);
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        async function fetchProjects() {
            setLoading(true);
            try {
                let url = '/api/projects';
                if (activeTeam) {
                    url += `?teamId=${activeTeam.id}`;
                }
                const response = await fetch(url);
                const data = await response.json();
                setProjects(data.projects || []);
            } catch (error) {
                console.error('Failed to fetch projects:', error);
            } finally {
                setLoading(false);
            }
        }

        if (!isTeamLoading) {
            fetchProjects();
        }
    }, [activeTeam, isTeamLoading]);

    const filteredProjects = projects.filter(project => {
        const query = searchQuery.toLowerCase();
        return (
            project.name.toLowerCase().includes(query) ||
            project.repoFullName.toLowerCase().includes(query)
        );
    });

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
                return <span className="badge bg-[var(--card)] text-[var(--muted)]">● No deployments</span>;
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold">
                        {activeTeam ? `${activeTeam.name} Projects` : 'Personal Projects'}
                    </h1>
                    <p className="text-[var(--muted-foreground)] mt-1">
                        Manage your Next.js deployments
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search projects..."
                            aria-label="Search projects"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 pl-9 pr-10 bg-[var(--card)] border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm transition-all"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {searchQuery ? (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        searchInputRef.current?.focus();
                                    }}
                                    className="p-1 rounded-md hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                    aria-label="Clear search"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            ) : (
                                <div className="hidden sm:flex items-center gap-0.5 text-[10px] text-[var(--muted)] font-medium border border-[var(--border)] rounded px-1.5 py-0.5 bg-[var(--background)]">
                                    <span>{isMac ? '⌘' : 'Ctrl'}</span>
                                    <span>K</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <Link href="/new" className="btn btn-primary whitespace-nowrap">
                        <Plus className="w-4 h-4" />
                        Add New
                    </Link>
                </div>
            </div>

            {/* Loading state */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="card">
                            <Skeleton className="h-6 w-1/2 mb-4" />
                            <Skeleton className="h-4 w-3/4 mb-2" />
                            <Skeleton className="h-4 w-1/3" />
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state - No projects at all */}
            {!loading && projects.length === 0 && (
                <OnboardingGuide />
            )}

            {/* Empty state - No search results */}
            {!loading && projects.length > 0 && filteredProjects.length === 0 && (
                <EmptyState
                    type="search"
                    title="No projects found"
                    description={`No projects match "${searchQuery}"`}
                    action={
                        <button
                            onClick={() => setSearchQuery('')}
                            className="btn btn-ghost mt-4 text-sm"
                        >
                            Clear search
                        </button>
                    }
                />
            )}

            {/* Projects grid */}
            {!loading && filteredProjects.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProjects.map((project) => (
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
