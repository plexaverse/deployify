'use client';

import React from 'react';
import { Search, Globe, Box, Shield, FileText, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmptyStateType = 'project' | 'deployment' | 'domain' | 'env' | 'search' | 'generic';

interface EmptyStateProps {
    title: string;
    description: string;
    action?: React.ReactNode;
    type?: EmptyStateType;
    className?: string;
}

export function EmptyState({ title, description, action, type = 'generic', className }: EmptyStateProps) {
    const getIcon = () => {
        switch (type) {
            case 'search': return Search;
            case 'domain': return Globe;
            case 'env': return Shield;
            case 'project': return Box;
            case 'deployment': return Layers;
            default: return FileText;
        }
    };

    const Icon = getIcon();

    return (
        <div className={cn(
            "flex flex-col items-center justify-center py-12 px-4 border border-dashed border-[var(--border)] rounded-xl bg-[var(--muted)]/5 text-center animate-fade-in",
            className
        )}>
            <div className="w-16 h-16 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-4 shadow-sm">
                <Icon className="w-8 h-8 text-[var(--muted-foreground)] opacity-50" />
            </div>
            <h3 className="text-lg font-medium mb-1">{title}</h3>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm mb-6 leading-relaxed">
                {description}
            </p>
            {action && (
                <div className="mt-2">
                    {action}
                </div>
            )}
        </div>
    );
}
