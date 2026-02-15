import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
    title: string;
    description?: React.ReactNode;
    icon?: LucideIcon;
    illustration?: React.ReactNode;
    action?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
}

export function EmptyState({
    title,
    description,
    icon: Icon,
    illustration,
    action,
    children,
    className
}: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center py-12 px-4 border border-dashed border-[var(--border)] rounded-xl bg-[var(--muted)]/5 text-center animate-fade-in relative overflow-hidden", className)}>
            {illustration ? (
                <div className="mb-6 w-full max-w-[240px] aspect-video flex items-center justify-center text-[var(--muted-foreground)]/20">
                    {illustration}
                </div>
            ) : Icon && (
                <div className="w-16 h-16 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-4 shadow-sm relative group z-10">
                    <div className="absolute inset-0 bg-[var(--primary)]/5 rounded-full scale-0 group-hover:scale-110 transition-transform duration-500" />
                    <Icon className="w-8 h-8 text-[var(--muted-foreground)] opacity-50 group-hover:opacity-100 group-hover:text-[var(--primary)] transition-all duration-300" />
                </div>
            )}

            <h3 className="text-lg font-medium mb-1 relative z-10">{title}</h3>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm mb-6 leading-relaxed relative z-10">
                {description}
            </p>

            <div className="relative z-10">
                {children}
                {action && (
                    <div className="mt-2">
                        {action}
                    </div>
                )}
            </div>
        </div>
    );
}
