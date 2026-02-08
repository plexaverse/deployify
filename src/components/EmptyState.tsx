'use client';

import {
    FolderSearch,
    Rocket,
    Globe,
    KeyRound,
    Search,
    AlertCircle,
    Plus
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

type EmptyStateType = 'project' | 'deployment' | 'domain' | 'env' | 'search' | 'generic';

interface EmptyStateProps {
    title: string;
    description: string;
    type?: EmptyStateType;
    icon?: ReactNode;
    action?: ReactNode;
    className?: string;
}

export function EmptyState({
    title,
    description,
    type = 'generic',
    icon,
    action,
    className
}: EmptyStateProps) {

    const getIcon = () => {
        if (icon) return icon;

        switch (type) {
            case 'project':
                return <FolderSearch className="w-12 h-12 text-[var(--muted-foreground)] opacity-50" />;
            case 'deployment':
                return <Rocket className="w-12 h-12 text-[var(--muted-foreground)] opacity-50" />;
            case 'domain':
                return <Globe className="w-12 h-12 text-[var(--muted-foreground)] opacity-50" />;
            case 'env':
                return <KeyRound className="w-12 h-12 text-[var(--muted-foreground)] opacity-50" />;
            case 'search':
                return <Search className="w-12 h-12 text-[var(--muted-foreground)] opacity-50" />;
            default:
                return <AlertCircle className="w-12 h-12 text-[var(--muted-foreground)] opacity-50" />;
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={cn(
                "flex flex-col items-center justify-center text-center p-12 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)]/50",
                className
            )}
        >
            <div className="bg-[var(--background)] p-4 rounded-full border border-[var(--border)] mb-4 shadow-sm relative group">
                {/* Subtle glow effect */}
                <div className="absolute inset-0 bg-[var(--primary)] opacity-0 group-hover:opacity-10 rounded-full transition-opacity duration-500 blur-xl" />
                {getIcon()}
            </div>

            <h3 className="text-lg font-semibold mb-2">{title}</h3>
            <p className="text-[var(--muted-foreground)] max-w-sm mb-6">
                {description}
            </p>

            {action && (
                <div className="mt-2">
                    {action}
                </div>
            )}
        </motion.div>
    );
}
