'use client';

import { AlertTriangle, X } from 'lucide-react';
import type { Deployment } from '@/types';

interface RollbackModalProps {
    deployment: Deployment;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function RollbackModal({ deployment, isOpen, onClose, onConfirm }: RollbackModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
                        Confirm Rollback
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[var(--border)] rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto">
                    <p className="text-[var(--muted-foreground)] mb-4">
                        Are you sure you want to rollback to this version? This will immediately switch traffic to the selected revision.
                    </p>

                    <div className="bg-[var(--background)] rounded-lg p-4 border border-[var(--border)] space-y-3">
                        <div>
                            <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase">Commit</span>
                            <p className="font-mono text-sm">{deployment.gitCommitSha.substring(0, 7)}</p>
                        </div>
                        <div>
                            <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase">Message</span>
                            <p className="text-sm line-clamp-2">{deployment.gitCommitMessage}</p>
                        </div>
                        <div className="flex justify-between">
                            <div>
                                <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase">Author</span>
                                <p className="text-sm">{deployment.gitCommitAuthor}</p>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase">Date</span>
                                <p className="text-sm">
                                    {new Date(deployment.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--border)] bg-[var(--background)] flex justify-end gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md hover:bg-[var(--border)] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity font-medium"
                    >
                        Confirm Rollback
                    </button>
                </div>
            </div>
        </div>
    );
}
