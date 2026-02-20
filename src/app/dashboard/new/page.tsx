'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, Lock, Globe, Loader2, GitBranch, X } from 'lucide-react';
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
        });
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to projects
                </Link>
                <h1 className="text-2xl font-bold">Import Git Repository</h1>
                <p className="text-[var(--muted-foreground)] mt-1">
                    Select a repository to import and deploy
                </p>
            </div>

            {/* Search */}
            <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)] z-10" />
                <Input
                    type="text"
                    placeholder="Search repositories..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 pr-10"
                    aria-label="Search repositories"
                />
                {search && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
                        <Card key={i} className="flex items-center gap-4">
                            <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-1/3" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Repository list */}
            {!loading && (
                <div className="space-y-3">
                    {filteredRepos.map((repo) => (
                        <Card
                            key={repo.id}
                            className="flex items-center gap-4 hover:border-[var(--primary)] transition-colors"
                        >
                            {/* Icon */}
                            <div className="w-10 h-10 rounded-lg bg-[var(--background)] flex items-center justify-center border border-[var(--border)]">
                                {repo.private ? (
                                    <Lock className="w-5 h-5 text-[var(--muted)]" />
                                ) : (
                                    <Globe className="w-5 h-5 text-[var(--muted)]" />
                                )}
                            </div>

                            {/* Repo info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-medium truncate">{repo.full_name}</h3>
                                    {repo.private && (
                                        <Badge variant="warning" className="text-[10px] px-2 py-0">
                                            Private
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-sm text-[var(--muted-foreground)] truncate">
                                    {repo.description || 'No description'}
                                </p>
                                <div className="flex items-center gap-4 mt-1 text-xs text-[var(--muted-foreground)]">
                                    {repo.language && (
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-[var(--primary)]"></span>
                                            {repo.language}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                        <GitBranch className="w-3 h-3" />
                                        {repo.default_branch}
                                    </span>
                                    <span>Updated {formatDate(repo.pushed_at)}</span>
                                </div>
                            </div>

                            {/* Import button */}
                            <Button
                                onClick={() => handleImport(repo)}
                                loading={importing === repo.full_name}
                                disabled={importing !== null}
                            >
                                Import
                            </Button>
                        </Card>
                    ))}

                    {filteredRepos.length === 0 && !loading && (
                        <Card className="text-center py-12">
                            <p className="text-[var(--muted-foreground)]">
                                {search ? 'No repositories match your search' : 'No repositories found'}
                            </p>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
