import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
    title: string;
    description?: React.ReactNode;
    icon?: LucideIcon;
    illustration?: React.ComponentType<{ className?: string }>;
    action?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
}

export function EmptyState({
    title,
    description,
    icon: Icon,
    illustration: Illustration,
    action,
    children,
    className
}: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center py-16 px-6 border-2 border-dashed border-[var(--border)] rounded-3xl bg-[var(--muted)]/5 text-center animate-fade-in shadow-sm", className)}>
            {Illustration ? (
                <div className="mb-8 relative">
                    <div className="absolute inset-0 bg-[var(--primary)]/5 blur-3xl rounded-full" />
                    <Illustration className="w-56 h-56 text-[var(--muted-foreground)] opacity-70 relative z-10" />
                </div>
            ) : Icon ? (
                <div className="w-16 h-16 rounded-2xl bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-6 shadow-sm relative group transition-all duration-300 hover:border-[var(--primary)]/30">
                    <div className="absolute inset-0 bg-[var(--primary)]/5 rounded-2xl scale-0 group-hover:scale-110 transition-transform duration-500" />
                    <Icon className="w-8 h-8 text-[var(--muted-foreground)] opacity-50 group-hover:opacity-100 group-hover:text-[var(--primary)] transition-all duration-300" />
                </div>
            ) : null}
            <h3 className="text-sm font-semibold mb-2 tracking-tight text-[var(--foreground)]">{title}</h3>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] max-w-sm mb-8 leading-relaxed">
                {description}
            </div>
            {children}
            {action && (
                <div className="mt-2">
                    {action}
                </div>
            )}
        </div>
    );
}
