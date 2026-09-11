'use client';

import { useEffect, useRef, useId } from 'react';
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
  /** Gate the confirm button (e.g. behind a typed confirmation). Default false. */
  confirmDisabled?: boolean;
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
  confirmDisabled = false,
  icon,
  headerLabel,
}: ConfirmationModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Accessibility: this markup had no dialog semantics, no Escape handler and no focus
  // management, so keyboard and screen-reader users could neither perceive nor dismiss it,
  // and focus stayed behind the overlay on the page underneath.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );

    focusable()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Trap Tab inside the dialog.
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="bg-[var(--card)] border border-[var(--border)] w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in"
        >
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
                <h3 id={titleId} className="text-[10px] font-bold tracking-tight text-[var(--foreground)]">
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
            <div id={descriptionId} className="text-[var(--muted-foreground)] text-[10px] font-bold leading-relaxed">
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
                  disabled={confirmDisabled}
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
