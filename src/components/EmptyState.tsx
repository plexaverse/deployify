import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description: React.ReactNode;
  icon: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-[var(--border)] rounded-xl bg-[var(--muted)]/5",
        className
      )}
    >
      <div className="w-16 h-16 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-4 shadow-sm relative group">
        <div className="absolute inset-0 bg-[var(--primary)]/5 rounded-full group-hover:bg-[var(--primary)]/10 transition-colors" />
        <Icon className="w-8 h-8 text-[var(--muted-foreground)] opacity-50 group-hover:opacity-100 group-hover:text-[var(--primary)] transition-all" />
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <div className="text-sm text-[var(--muted-foreground)] max-w-sm mb-6 leading-relaxed">
        {description}
      </div>
      {children && <div className="mb-6 w-full flex justify-center">{children}</div>}
      {action && <div>{action}</div>}
    </div>
  );
}
