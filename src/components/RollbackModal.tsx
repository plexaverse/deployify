'use client';

import { AlertTriangle, X } from 'lucide-react';
import type { Deployment } from '@/types';
import { Portal } from '@/components/ui/portal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';

interface RollbackModalProps {
    deployment: Deployment;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function RollbackModal({ deployment, isOpen, onClose, onConfirm }: RollbackModalProps) {
    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                <Card className="w-full max-w-md p-0 overflow-hidden animate-fade-in max-h-[85vh] shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-[var(--warning)]/10 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">System Action</span>
                                <h3 className="text-[10px] font-bold tracking-tight text-[var(--foreground)]">Confirm Rollback</h3>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-8 w-8 rounded-full"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-6 leading-relaxed">
                            Are you sure you want to rollback to this version? This will immediately switch traffic to the selected revision.
                        </p>

                        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)] space-y-4 shadow-sm">
                            <div className="space-y-1">
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Git Commit</span>
                                <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--foreground)] bg-[var(--muted)]/20 px-2 py-1 rounded w-fit">{deployment.gitCommitSha.substring(0, 7).toUpperCase()}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Message</span>
                                <p className="text-[10px] font-bold line-clamp-2 text-[var(--foreground)]">{deployment.gitCommitMessage}</p>
                            </div>
                            <div className="flex justify-between gap-4 pt-2">
                                <div className="space-y-1">
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Author</span>
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--foreground)]">{deployment.gitCommitAuthor}</p>
                                </div>
                                <div className="text-right space-y-1">
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Deployed At</span>
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--foreground)]">
                                        {new Date(deployment.createdAt).toLocaleDateString().toUpperCase()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-[var(--border)] bg-[var(--background)] flex justify-end gap-3 shrink-0">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            className="text-[8px] font-bold uppercase tracking-wider"
                        >
                            Cancel
                        </Button>
                        <MovingBorderButton
                            onClick={onConfirm}
                            containerClassName="h-10 w-40"
                            className="text-[8px] font-bold uppercase tracking-wider"
                        >
                            Confirm Rollback
                        </MovingBorderButton>
                    </div>
                </Card>
            </div>
        </Portal>
    );
}
