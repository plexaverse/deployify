'use client';

import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Portal } from '@/components/ui/portal';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
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
  loading = false,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in">
        <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
            <div className="flex items-center gap-2 font-semibold text-lg">
              {variant === 'destructive' && (
                <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
              )}
              {title}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={loading}
              className="rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="text-[var(--muted-foreground)] text-sm leading-relaxed">
              {description}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--background)] flex justify-end gap-3 shrink-0">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={loading}
            >
              {cancelText}
            </Button>
            <Button
              variant={variant === 'destructive' ? 'destructive' : 'primary'}
              onClick={onConfirm}
              loading={loading}
              className="min-w-[100px]"
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
