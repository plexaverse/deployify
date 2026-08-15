'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Plus, Search, X, Layout } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingGuide } from '@/components/OnboardingGuide';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { ProjectCard } from '@/components/ProjectCard';
import { CommandPalette } from '@/components/CommandPalette';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
    Activity,
    Database,
    Loader2
} from 'lucide-react';
import type { Project, Deployment } from '@/types';
import { useTeam } from '@/contexts/TeamContext';

interface ProjectWithDeployment extends Project {
    latestDeployment?: Deployment;
}

export default function DashboardPage() {
    const [projects, setProjects] = useState<ProjectWithDeployment[]>([]);
    const [infraHealth, setInfraHealth] = useState<{
        summary: {
            totalProjects: number;
            totalConnectors: number;
            healthyConnectors: number;
            degradedConnectors: number;
            unhealthyConnectors: number;
            provisioningConnectors: number;
            uptimeScore: number;
        };
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingInfra, setLoadingInfra] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);
    const { activeTeam, isLoading: isTeamLoading } = useTeam();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            ) {
                return;
            }

            if (e.key === '/') {
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

        async function fetchInfraHealth() {
            setLoadingInfra(true);
            try {
                let url = '/api/infrastructure/health';
                if (activeTeam) {
                    url += `?teamId=${activeTeam.id}`;
                }
                const response = await fetch(url);
                const data = await response.json();
                if (data.success) {
                    setInfraHealth(data);
                }
            } catch (error) {
                console.error('Failed to fetch infra health:', error);
            } finally {
                setLoadingInfra(false);
            }
        }

        if (!isTeamLoading) {
            fetchProjects();
            fetchInfraHealth();
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
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            <CommandPalette />

            {/* Fleet Health Overview */}
            {!loading && projects.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-fade-in">
                    <Card className="md:col-span-3 overflow-hidden p-0 border-[var(--primary)]/10 bg-gradient-to-br from-[var(--card)] to-[var(--muted)]/5">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                                    <Activity className="w-4 h-4 text-[var(--primary)]" />
                                </div>
                                <div className="space-y-0.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Infrastructure Fleet</span>
                                    <h3 className="text-[10px] font-bold">Global Connectivity Health</h3>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                {loadingInfra ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                                ) : infraHealth && (
                                    <>
                                        <div className="text-right">
                                            <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Global Uptime</span>
                                            <span className={cn(
                                                "text-[10px] font-bold uppercase",
                                                infraHealth.summary.uptimeScore > 98 ? "text-[var(--success)]" : "text-[var(--warning)]"
                                            )}>{infraHealth.summary.uptimeScore}%</span>
                                        </div>
                                        <Separator orientation="vertical" className="h-8 bg-[var(--border)]" />
                                        <div className="flex items-center gap-3">
                                            <div className="text-center">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Healthy</span>
                                                <span className="text-[10px] font-bold text-[var(--success)]">{infraHealth.summary.healthyConnectors}</span>
                                            </div>
                                            <div className="text-center">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Slow</span>
                                                <span className="text-[10px] font-bold text-[var(--warning)]">{infraHealth.summary.degradedConnectors}</span>
                                            </div>
                                            <div className="text-center">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Failed</span>
                                                <span className="text-[10px] font-bold text-[var(--error)]">{infraHealth.summary.unhealthyConnectors}</span>
                                            </div>
                                        </div>
                                    <Separator orientation="vertical" className="h-8 bg-[var(--border)]" />
                                    <Link href="/dashboard/infrastructure">
                                        <Button variant="ghost" size="sm" className="h-8 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] hover:bg-[var(--primary)]/5">
                                            View Fleet
                                        </Button>
                                    </Link>
                                    </>
                                )}
                            </div>
                        </div>
                    </Card>

                    <Card className="overflow-hidden p-4 border-[var(--primary)]/10 bg-[var(--primary)]/5 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-2">
                            <Database className="w-3.5 h-3.5 text-[var(--primary)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Active Resources</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-[10px] font-bold tracking-tighter">
                                {loadingInfra ? '...' : infraHealth?.summary.totalConnectors || 0}
                            </span>
                            <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Managed Connectors</span>
                        </div>
                    </Card>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Layout className="w-8 h-8 text-[var(--primary)]" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Workspace Overview</span>
                        <h1 className="text-[10px] font-bold tracking-tight">
                            {activeTeam ? `${activeTeam.name} Projects` : 'Personal Projects'}
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" />
                        <Input
                            ref={searchInputRef}
                            type="text"
                            placeholder="SEARCH PROJECTS..."
                            aria-label="Search projects"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    e.stopPropagation();
                                    setSearchQuery('');
                                }
                            }}
                            className="pl-9 pr-10 shadow-sm transition-all duration-200 focus:shadow-md"
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
                                <div className="hidden sm:flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] border border-[var(--border)] rounded px-1.5 py-0.5 bg-[var(--background)]">
                                    <span>/</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <Link href="/new">
                        <MovingBorderButton
                            as="div"
                            containerClassName="h-10 w-36"
                            className="text-[10px] font-bold uppercase tracking-wider"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            ADD NEW
                        </MovingBorderButton>
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
                <div className="max-w-2xl mx-auto">
                    <EmptyState
                        title="No projects found"
                        description={`We couldn't find any projects matching "${searchQuery}"`}
                        icon={Search}
                        action={
                            <Button
                                variant="ghost"
                                onClick={() => setSearchQuery('')}
                                className="hover:bg-[var(--card-hover)]"
                            >
                                Clear search
                            </Button>
                        }
                    />
                </div>
            )}

            {/* Projects grid */}
            {!loading && filteredProjects.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                >
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
                                    className="h-full min-h-[12rem] cursor-pointer p-0 overflow-hidden border-0 bg-transparent shadow-none"
                                />
                            </Link>
                        ))}
                    </BentoGrid>
                </motion.div>
            )}
        </div>
    );
}
