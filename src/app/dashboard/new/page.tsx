'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, Lock, Globe, GitBranch, X, ChevronRight, Github } from 'lucide-react';
import type { GitHubRepo } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function NewProjectPage() {
    const router = useRouter();
    const [repos, setRepos] = useState<GitHubRepo[]>([]);
    const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [isMac, setIsMac] = useState(false);

    useEffect(() => {
        setIsMac(navigator.userAgent.indexOf('Mac') !== -1);
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') {
                e.preventDefault();
                searchRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        async function fetchRepos() {
            try {
                const response = await fetch('/api/repos');
                const data = await response.json();

                if (data.error) {
                    setError(data.error);
                } else {
                    setRepos(data.repos || []);
                    setFilteredRepos(data.repos || []);
                }
            } catch {
                setError('Failed to fetch repositories');
            } finally {
                setLoading(false);
            }
        }

        fetchRepos();
    }, []);

    useEffect(() => {
        if (search) {
            setFilteredRepos(
                repos.filter(repo =>
                    repo.full_name.toLowerCase().includes(search.toLowerCase()) ||
                    repo.description?.toLowerCase().includes(search.toLowerCase())
                )
            );
        } else {
            setFilteredRepos(repos);
        }
    }, [search, repos]);

    const handleImport = (repo: GitHubRepo) => {
        setImporting(repo.full_name);
        router.push(`/dashboard/new/import?repo=${repo.full_name}`);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }).toUpperCase();
    };

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            {/* Header */}
            <div className="space-y-4">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to projects
                </Link>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <Github className="w-8 h-8 text-[var(--primary)]" />
                        </div>
                        <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Git Connectivity</span>
                            <h1 className="text-3xl font-bold tracking-tight">Import Repository</h1>
                        </div>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)] z-10" />
                <Input
                    ref={searchRef}
                    type="text"
                    placeholder="Search repositories..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-12 pr-16 h-12"
                    aria-label="Search repositories"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                    {search ? null : (
                        <div className="hidden sm:flex items-center gap-0.5 text-[10px] text-[var(--muted)] font-bold border border-[var(--border)] rounded px-1.5 py-0.5 bg-[var(--background)]">
                            <span>{isMac ? '⌘' : 'Ctrl'}</span>
                            <span>K</span>
                        </div>
                    )}
                </div>
                {search && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            setSearch('');
                            searchRef.current?.focus();
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)] z-10"
                        aria-label="Clear search"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Error message */}
            {error && (
                <div className="mb-6 p-4 rounded-lg bg-[var(--error-bg)] border border-[var(--error)] text-[var(--error)]">
                    {error}
                </div>
            )}

            {/* Loading state */}
            {loading && (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Card key={i} className="overflow-hidden p-0">
                            <div className="p-6 flex items-center gap-4">
                                <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-1/3" />
                                    <Skeleton className="h-3 w-1/2" />
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Repository list */}
            {!loading && (
                <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                        {filteredRepos.map((repo) => (
                            <motion.div
                                key={repo.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                whileHover={{ y: -2, scale: 1.005 }}
                                whileTap={{ scale: 0.995 }}
                            >
                                <Card
                                    className="group relative hover:border-[var(--primary)] transition-all cursor-pointer overflow-hidden p-0"
                                    onClick={() => handleImport(repo)}
                                >
                                    <div className="p-6 flex items-center gap-4 relative">
                                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                        {/* Icon */}
                                        <div className="relative z-10 w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center border border-[var(--border)] group-hover:border-[var(--primary)]/30 transition-colors">
                                            {repo.private ? (
                                                <Lock className="w-5 h-5 text-[var(--warning)]" />
                                            ) : (
                                                <Globe className="w-5 h-5 text-[var(--success)]" />
                                            )}
                                        </div>

                                        {/* Repo info */}
                                        <div className="relative z-10 flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors truncate">
                                                    {repo.full_name}
                                                </h3>
                                                {repo.private && (
                                                    <Badge variant="warning" className="text-[10px] px-1.5 py-0.5 uppercase font-bold tracking-wider">
                                                        Private
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] truncate mt-0.5">
                                                {repo.description || 'No description'}
                                            </p>
                                            <div className="flex items-center gap-4 mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                {repo.language && (
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-[var(--info)]"></span>
                                                        {repo.language}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1.5">
                                                    <GitBranch className="w-3.5 h-3.5" />
                                                    {repo.default_branch}
                                                </span>
                                                <span>Updated {formatDate(repo.pushed_at)}</span>
                                            </div>
                                        </div>

                                        {/* Action indicator */}
                                        <div className="relative z-10 flex items-center gap-3">
                                            <Button
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleImport(repo);
                                                }}
                                                loading={importing === repo.full_name}
                                                disabled={importing !== null}
                                                className="hidden sm:flex text-[10px] font-bold uppercase tracking-wider"
                                            >
                                                Import
                                            </Button>
                                            <div className="opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                                <ChevronRight className="w-5 h-5 text-[var(--primary)]" />
                                            </div>
                                        </div>
                                    </div>
                                </Card>

                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {filteredRepos.length === 0 && !loading && (
                        <Card className="overflow-hidden p-0">
                            <div className="text-center py-12">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                    {search ? 'No repositories match your search' : 'No repositories found'}
                                </p>
                            </div>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
