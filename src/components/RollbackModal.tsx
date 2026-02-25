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
                    <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
                        <h3 className="font-semibold text-lg flex items-center gap-2 text-[var(--foreground)]">
                            <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
                            Confirm Rollback
                        </h3>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-8 w-8"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto">
                        <p className="text-[var(--muted-foreground)] mb-4">
                            Are you sure you want to rollback to this version? This will immediately switch traffic to the selected revision.
                        </p>

                        <div className="bg-[var(--background)] rounded-lg p-4 border border-[var(--border)] space-y-3">
                            <div>
                                <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase">Commit</span>
                                <p className="font-mono text-sm text-[var(--foreground)]">{deployment.gitCommitSha.substring(0, 7)}</p>
                            </div>
                            <div>
                                <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase">Message</span>
                                <p className="text-sm line-clamp-2 text-[var(--foreground)]">{deployment.gitCommitMessage}</p>
                            </div>
                            <div className="flex justify-between">
                                <div>
                                    <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase">Author</span>
                                    <p className="text-sm text-[var(--foreground)]">{deployment.gitCommitAuthor}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase">Date</span>
                                    <p className="text-sm text-[var(--foreground)]">
                                        {new Date(deployment.createdAt).toLocaleDateString()}
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
                        >
                            Cancel
                        </Button>
                        <MovingBorderButton
                            onClick={onConfirm}
                            containerClassName="h-10 w-40"
                            className="font-bold text-sm"
                        >
                            Confirm Rollback
                        </MovingBorderButton>
                    </div>
                </Card>
            </div>
        </Portal>
    );
}
