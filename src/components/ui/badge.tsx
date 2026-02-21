import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info' | 'error';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
    const variants = {
        default: 'border-transparent bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-80',
        secondary: 'border-transparent bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-80',
        destructive: 'border-transparent bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-80',
        outline: 'text-[var(--foreground)] border-[var(--border)]',
        success: 'border-transparent bg-[var(--success-bg)] text-[var(--success)] hover:opacity-80',
        warning: 'border-transparent bg-[var(--warning-bg)] text-[var(--warning)] hover:opacity-80',
        info: 'border-transparent bg-[var(--info-bg)] text-[var(--info)] hover:opacity-80',
        error: 'border-transparent bg-[var(--error-bg)] text-[var(--error)] hover:opacity-80',
    };

    return (
        <div
            className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                variants[variant],
                className
            )}
            {...props}
        />
    );
}
