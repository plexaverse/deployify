import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertCircle, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
    status: string;
    className?: string;
    showIcon?: boolean;
}

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'ready':
                return {
                    variant: 'success' as const,
                    label: 'Ready',
                    icon: CheckCircle2,
                    animation: ''
                };
            case 'error':
                return {
                    variant: 'destructive' as const, // Maps to 'error' variant logic if badge supports it, or use destructive
                    label: 'Error',
                    icon: AlertCircle,
                    animation: ''
                };
            case 'building':
            case 'deploying':
                return {
                    variant: 'warning' as const,
                    label: 'Building',
                    icon: Loader2,
                    animation: 'animate-spin'
                };
            case 'queued':
                return {
                    variant: 'secondary' as const,
                    label: 'Queued',
                    icon: Clock,
                    animation: ''
                };
            case 'cancelled':
                return {
                    variant: 'secondary' as const,
                    label: 'Cancelled',
                    icon: XCircle,
                    animation: ''
                };
            default:
                return {
                    variant: 'secondary' as const,
                    label: status,
                    icon: null,
                    animation: ''
                };
        }
    };

    const config = getStatusConfig(status);
    const Icon = config.icon;

    return (
        <Badge variant={config.variant} className={cn("gap-1.5", className)}>
            {showIcon && Icon && (
                <Icon className={cn("w-3 h-3", config.animation)} />
            )}
            {config.label}
        </Badge>
    );
}
