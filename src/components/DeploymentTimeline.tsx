import { CheckCircle2, Circle, Loader2, XCircle, AlertCircle } from 'lucide-react';
import type { Deployment } from '@/types';
import { cn } from '@/lib/utils';

interface DeploymentTimelineProps {
    deployment: Deployment;
}

export function DeploymentTimeline({ deployment }: DeploymentTimelineProps) {
    const steps = [
        { id: 'queued', label: 'Queued' },
        { id: 'building', label: 'Building' },
        { id: 'deploying', label: 'Deploying' },
        { id: 'ready', label: 'Ready' },
    ];

    const getStepStatus = (stepId: string, index: number) => {
        const status = deployment.status;

        // Handle Error/Cancelled state specially
        if (status === 'error' || status === 'cancelled') {
            return 'inactive';
        }

        // Exact match
        if (status === stepId) return 'current';

        // Past steps
        const statusIndex = steps.findIndex(s => s.id === status);
        if (statusIndex > index) return 'completed';

        return 'inactive';
    };

    const isError = deployment.status === 'error';
    const isCancelled = deployment.status === 'cancelled';
    const currentIndex = steps.findIndex(s => s.id === deployment.status);

    // Calculate progress width
    let progressWidth = 0;
    if (!isError && !isCancelled && currentIndex !== -1) {
         progressWidth = (currentIndex / (steps.length - 1)) * 100;
    }

    return (
        <div className="w-full py-4">
            <div className="relative flex items-center justify-between">
                {/* Connecting Line (Background) */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-[var(--border)] -z-10"></div>

                {/* Progress Line */}
                {!isError && !isCancelled && currentIndex !== -1 && (
                    <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-[var(--primary)] -z-10 transition-all duration-500"
                        style={{ width: `${progressWidth}%` }}
                    ></div>
                )}

                {steps.map((step, index) => {
                    const stepStatus = getStepStatus(step.id, index);

                    let icon;
                    let colorClass = "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)]";

                    if (isError && step.id === 'ready') {
                         icon = <XCircle className="w-5 h-5 text-[var(--error)]" />;
                         colorClass = "bg-[var(--card)] border-[var(--error)] text-[var(--error)]";
                    } else if (isCancelled && step.id === 'ready') {
                         icon = <XCircle className="w-5 h-5 text-[var(--muted)]" />;
                         colorClass = "bg-[var(--card)] border-[var(--muted)] text-[var(--muted)]";
                    } else if (stepStatus === 'completed') {
                        icon = <CheckCircle2 className="w-5 h-5 text-[var(--primary)]" />;
                        colorClass = "bg-[var(--card)] border-[var(--primary)] text-[var(--primary)]";
                    } else if (stepStatus === 'current') {
                        if (step.id === 'ready') {
                             icon = <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />;
                             colorClass = "bg-[var(--card)] border-[var(--success)] text-[var(--success)]";
                        } else {
                            icon = <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />;
                            colorClass = "bg-[var(--card)] border-[var(--primary)] text-[var(--primary)]";
                        }
                    } else {
                        icon = <Circle className="w-4 h-4" />;
                    }

                    return (
                        <div key={step.id} className="flex flex-col items-center gap-2 bg-[var(--background)] px-2 z-10">
                            <div className={cn("w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors", colorClass)}>
                                {icon}
                            </div>
                            <span className={cn("text-xs font-medium transition-colors",
                                stepStatus === 'current' || stepStatus === 'completed' ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'
                            )}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>

             {/* Error Message Display */}
             {isError && (
                <div className="mt-4 p-3 rounded-lg bg-[var(--error-bg)] border border-[var(--error)]/20 flex items-start gap-2 text-sm text-[var(--error)]">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{deployment.errorMessage || 'An unknown error occurred during deployment.'}</p>
                </div>
            )}
             {isCancelled && (
                <div className="mt-4 p-3 rounded-lg bg-[var(--muted)]/10 border border-[var(--border)] flex items-start gap-2 text-sm text-[var(--muted-foreground)]">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>Deployment was cancelled.</p>
                </div>
            )}
        </div>
    );
}
