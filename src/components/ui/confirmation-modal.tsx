'use client';

import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
    loading?: boolean;
}

export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    loading = false
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    const isDestructive = variant === 'destructive';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        {isDestructive && <AlertTriangle className="w-5 h-5 text-red-500" />}
                        {title}
                    </h3>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="p-2 hover:bg-[var(--border)] rounded-md transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-[var(--muted-foreground)]">
                        {description}
                    </p>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--border)] bg-[var(--background)] flex justify-end gap-3 shrink-0">
                    <Button
                        onClick={onClose}
                        disabled={loading}
                        variant="outline"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        onClick={onConfirm}
                        loading={loading}
                        className={isDestructive ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
                    >
                        {confirmText}
                    </Button>
                </div>
            </div>
        </div>
    );
}
