'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, Lock, Globe, Loader2, GitBranch, X } from 'lucide-react';
import type { GitHubRepo } from '@/types';

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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)]" />
                <input
                    type="text"
                    placeholder="Search repositories..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input pl-10 pr-10"
                    aria-label="Search repositories"
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] p-1 rounded-md hover:bg-[var(--card-hover)] transition-colors"
                        aria-label="Clear search"
                    >
                        <X className="w-4 h-4" />
                    </button>
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
                        <div key={i} className="card animate-pulse flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-[var(--border)]"></div>
                            <div className="flex-1">
                                <div className="h-4 bg-[var(--border)] rounded w-1/3 mb-2"></div>
                                <div className="h-3 bg-[var(--border)] rounded w-1/2"></div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Repository list */}
            {!loading && (
                <div className="space-y-3">
                    {filteredRepos.map((repo) => (
                        <div
                            key={repo.id}
                            className="card flex items-center gap-4 hover:border-[var(--primary)] transition-colors"
                        >
                            {/* Icon */}
                            <div className="w-10 h-10 rounded-lg bg-[var(--background)] flex items-center justify-center">
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
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)]">
                                            Private
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-[var(--muted-foreground)] truncate">
                                    {repo.description || 'No description'}
                                </p>
                                <div className="flex items-center gap-4 mt-1 text-xs text-[var(--muted)]">
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
                            <button
                                onClick={() => handleImport(repo)}
                                disabled={importing !== null}
                                className="btn btn-primary"
                            >
                                {importing === repo.full_name ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    'Import'
                                )}
                            </button>
                        </div>
                    ))}

                    {filteredRepos.length === 0 && !loading && (
                        <div className="card text-center py-12">
                            <p className="text-[var(--muted-foreground)]">
                                {search ? 'No repositories match your search' : 'No repositories found'}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
