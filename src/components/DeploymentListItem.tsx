import React from 'react';
import { ExternalLink, FileText, RotateCcw, Check } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import type { Deployment } from '@/types';

interface DeploymentListItemProps {
    deployment: Deployment;
    onCopy: (text: string, id: string) => void;
    onRollback?: (id: string) => void;
    onCancel?: (id: string) => void;
    onViewLogs: (id: string) => void;
    copiedId?: string | null;
}

export function DeploymentListItem({
    deployment,
    onCopy,
    onRollback,
    onCancel,
    onViewLogs,
    copiedId
}: DeploymentListItemProps) {
    const formatDate = (date: Date | string | number) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).toUpperCase();
    };

    return (
        <div className="p-6 hover:bg-[var(--card-hover)] transition-colors group">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="mt-1">
                        <StatusBadge status={deployment.status} />
                    </div>
                    <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="font-bold text-[11px] truncate max-w-md">
                                {deployment.gitCommitMessage}
                            </p>
                            <Badge variant={deployment.type === 'production' ? 'success' : 'info'} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5">
                                {deployment.type.toUpperCase()}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                            <div className="flex items-center gap-1">
                                <span className="font-mono text-[var(--foreground)] uppercase">{deployment.gitBranch.toUpperCase()}</span>
                                <span className="text-[var(--muted)]">@</span>
                                <span
                                    className="hover:text-[var(--foreground)] cursor-pointer font-mono uppercase"
                                    onClick={() => onCopy(deployment.gitCommitSha, `sha-${deployment.id}`)}
                                >
                                    {deployment.gitCommitSha.substring(0, 7).toUpperCase()}
                                </span>
                                {copiedId === `sha-${deployment.id}` && <Check className="w-3 h-3 text-[var(--success)]" />}
                            </div>
                            <span className="text-[var(--muted)]">•</span>
                            <span>{formatDate(deployment.createdAt).toUpperCase()}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 pl-11 md:pl-0">
                    {deployment.url && (
                        <a
                            href={deployment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8 px-2.5 text-[9px] font-bold uppercase tracking-wider border border-[var(--border)] hover:border-[var(--foreground)]')}
                        >
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5 text-[var(--muted-foreground)]" />
                            View
                        </a>
                    )}

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewLogs(deployment.id)}
                        className="h-8 px-2.5 text-[9px] font-bold uppercase tracking-wider border border-[var(--border)] hover:border-[var(--foreground)]"
                    >
                        <FileText className="w-3.5 h-3.5 mr-1.5 text-[var(--muted-foreground)]" />
                        Logs
                    </Button>

                    {deployment.status === 'ready' && deployment.type === 'production' && deployment.cloudRunRevision && onRollback && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRollback(deployment.id)}
                            className="h-8 px-2.5 text-[9px] font-bold uppercase tracking-wider text-[var(--error)] hover:bg-[var(--error-bg)] border border-[var(--error)]/20"
                        >
                            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                            Rollback
                        </Button>
                    )}

                    {(deployment.status === 'queued' || deployment.status === 'building') && onCancel && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onCancel(deployment.id)}
                            className="h-8 px-2.5 text-[9px] font-bold uppercase tracking-wider text-[var(--error)] hover:bg-[var(--error-bg)] border border-[var(--error)]/20"
                        >
                            Cancel
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
