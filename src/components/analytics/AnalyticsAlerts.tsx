'use client';

import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { PerformanceAlert } from '@/lib/analytics/alerts';

interface AnalyticsAlertsProps {
    alerts: PerformanceAlert[];
}

export function AnalyticsAlerts({ alerts }: AnalyticsAlertsProps) {
    if (alerts.length === 0) return null;

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Performance Warnings
            </h3>
            <div className="space-y-2">
                {alerts.map((alert) => (
                    <div
                        key={alert.id}
                        className={`flex gap-3 p-3 rounded-lg border text-xs ${alert.type === 'critical'
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                                : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                            }`}
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
