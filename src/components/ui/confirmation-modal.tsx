'use client';

import { AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Portal } from '@/components/ui/portal';
import { cn } from '@/lib/utils';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  loading?: boolean;
  showConfirm?: boolean;
  showCancel?: boolean;
  icon?: React.ReactNode;
  headerLabel?: string;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm = () => {},
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false,
  showConfirm = true,
  showCancel = true,
  icon,
  headerLabel,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in">
        <div className="bg-[var(--card)] border border-[var(--border)] w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[var(--border)] bg-[var(--background)] shrink-0">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                variant === 'destructive' ? "bg-[var(--error)]/10" : "bg-[var(--primary)]/10"
              )}>
                {icon || (variant === 'destructive' ? (
                  <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-[var(--primary)]" />
                ))}
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {headerLabel || (variant === 'destructive' ? 'Critical Action' : 'Confirmation Required')}
                </span>
                <h3 className="text-xs font-bold tracking-tight text-[var(--foreground)]">
                  {title}
                </h3>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={loading}
              className="h-8 w-8 rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="text-[var(--muted-foreground)] text-xs leading-relaxed">
              {description}
            </div>
          </div>

          {/* Footer */}
          {(showConfirm || showCancel) && (
            <div className="p-4 border-t border-[var(--border)] bg-[var(--background)] flex justify-end gap-3 shrink-0">
              {showCancel && (
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={loading}
                >
                  {cancelText}
                </Button>
              )}
              {showConfirm && (
                <Button
                  variant={variant === 'destructive' ? 'destructive' : 'primary'}
                  onClick={onConfirm}
                  loading={loading}
                  className="min-w-[100px]"
                >
                  {confirmText}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
