'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Plus, Search, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingGuide } from '@/components/OnboardingGuide';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { ProjectCard } from '@/components/ProjectCard';
import { CommandPalette } from '@/components/CommandPalette';
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

    return (
        <div className="p-8">
            <CommandPalette />
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
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
                            {searchQuery ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setSearchQuery('');
                                        searchInputRef.current?.focus();
                                    }}
                                    className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                    aria-label="Clear search"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </Button>
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
                <BentoGrid>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <BentoGridItem
                            key={i}
                            title={<Skeleton className="h-4 w-1/2 mb-2" />}
                            description={<Skeleton className="h-3 w-3/4" />}
                            header={<Skeleton className="h-32 w-full rounded-xl" />}
                            className="min-h-[12rem]"
                        />
                    ))}
                </BentoGrid>
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
                <BentoGrid>
                    {filteredProjects.map((project) => (
                        <Link
                            key={project.id}
                            href={`/dashboard/${project.id}`}
                            className="block h-full group"
                        >
                            <BentoGridItem
                                title={null}
                                description={null}
                                header={<ProjectCard project={project} />}
                                className="h-full min-h-[12rem] cursor-pointer hover:border-[var(--primary)] transition-colors"
                            />
                        </Link>
                    ))}
                </BentoGrid>
            )}
        </div>
    );
}
