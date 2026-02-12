import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
    title: string;
    description: string;
    action?: React.ReactNode;
    icon?: LucideIcon;
    className?: string;
    children?: React.ReactNode;
}

export function EmptyState({
    title,
    description,
    action,
    icon: Icon,
    className,
    children
}: EmptyStateProps) {
    return (
        <div className={cn(
            "flex flex-col items-center justify-center py-12 px-4 border border-dashed border-[var(--border)] rounded-xl bg-[var(--muted)]/5 text-center animate-fade-in",
            className
        )}>
            {Icon && (
                <div className="w-16 h-16 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-4 shadow-sm ring-4 ring-[var(--muted)]/20">
                    <Icon className="w-8 h-8 text-[var(--muted-foreground)] opacity-70" />
                </div>
            )}
            <h3 className="text-lg font-medium mb-2 text-[var(--foreground)]">{title}</h3>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm mb-6 leading-relaxed">
                {description}
            </p>
            {children && (
                <div className="mb-6 w-full max-w-md">
                    {children}
                </div>
            )}
            {action && (
                <div className="flex justify-center">
                    {action}
                </div>
            )}
        </div>
    );
}
