'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, GitBranch, Clock, Search, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingGuide } from '@/components/OnboardingGuide';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { ProjectAvatar } from '@/components/ProjectAvatar';
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
                return <Badge variant="success" className="gap-1">● Ready</Badge>;
            case 'building':
            case 'deploying':
                return <Badge variant="warning" className="gap-1">● Building</Badge>;
            case 'error':
                return <Badge variant="destructive" className="gap-1">● Error</Badge>;
            case 'queued':
                return <Badge variant="info" className="gap-1">● Queued</Badge>;
            default:
                return <Badge variant="secondary" className="gap-1 text-[var(--muted)] bg-[var(--card)]">● No deployments</Badge>;
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
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" />
                        <Input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search projects..."
                            aria-label="Search projects"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-10"
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
                    <Link href="/new" className={buttonVariants({ variant: 'primary', className: 'whitespace-nowrap' })}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add New
                    </Link>
                </div>
            </div>

            {/* Loading state */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Card key={i} className="h-full">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex flex-1 items-center gap-3 min-w-0">
                                    <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                                    <div className="min-w-0 flex-1 space-y-2">
                                        <Skeleton className="h-5 w-3/4" />
                                        <Skeleton className="h-4 w-1/2" />
                                    </div>
                                </div>
                                <Skeleton className="h-6 w-16 rounded-full" />
                            </div>
                            <Skeleton className="h-4 w-full mb-6" />
                            <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                        </Card>
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
                    title="No projects found"
                    description={`No projects match "${searchQuery}"`}
                    icon={Search}
                    action={
                        <Button
                            variant="ghost"
                            onClick={() => setSearchQuery('')}
                        >
                            Clear search
                        </Button>
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
                            className="block group"
                        >
                            <Card className="h-full hover:border-[var(--primary)] transition-colors">
                                {/* Project header */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex flex-1 items-center gap-3 min-w-0">
                                        <ProjectAvatar name={project.name} productionUrl={project.productionUrl} />
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-semibold truncate group-hover:text-[var(--primary)] transition-colors">
                                                {project.name}
                                            </h3>
                                            <p className="text-sm text-[var(--muted-foreground)] truncate">
                                                {project.repoFullName}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex-shrink-0 ml-2">
                                        {getStatusBadge(project.latestDeployment?.status)}
                                    </div>
                                </div>

                                {/* Production URL */}
                                {project.productionUrl && (
                                    <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] mb-4 ml-1">
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
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
