'use client';

import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { PerformanceAlert } from '@/lib/analytics/alerts';
import { cn } from '@/lib/utils';

interface AnalyticsAlertsProps {
    alerts: PerformanceAlert[];
}

export function AnalyticsAlerts({ alerts }: AnalyticsAlertsProps) {
    if (alerts.length === 0) return null;

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-[var(--foreground)]">
                <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />
                Performance Warnings
            </h3>
            <div className="space-y-2">
                {alerts.map((alert) => (
                    <div
                        key={alert.id}
                        className={cn(
                            "flex gap-3 p-3 rounded-lg border text-xs",
                            alert.type === 'critical'
                                ? 'bg-[var(--error-bg)] border-[var(--error)]/20 text-[var(--error)]'
                                : 'bg-[var(--warning-bg)] border-[var(--warning)]/20 text-[var(--warning)]'
                        )}
                    >
                        {alert.type === 'critical' ? (
                            <XCircle className="w-4 h-4 shrink-0" />
                        ) : (
                            <Info className="w-4 h-4 shrink-0" />
                        )}
                        <div className="space-y-1">
                            <p className="font-semibold">{alert.message}</p>
                            <p className="opacity-70">
                                Current {alert.metric}: <span className="font-mono">{alert.value.toFixed(2)}</span>
                                (Threshold: {alert.threshold})
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
