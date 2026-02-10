'use client';

import { cn } from "@/lib/utils";

interface UsageGaugeProps {
    icon: React.ReactNode;
    title: string;
    used: number;
    limit: number;
    unit?: string;
    percent: number;
    format?: (v: number) => string;
}

export function UsageGauge({
    icon,
    title,
    used,
    limit,
    unit,
    percent,
    format
}: UsageGaugeProps) {
    const radius = 50;
    const stroke = 8;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (percent / 100) * circumference;

    const formattedUsed = format ? format(used) : used;
    const formattedLimit = limit === Infinity ? 'Unlimited' : (format ? format(limit) : limit);

    return (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
            <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="p-2 bg-[var(--card-hover)] rounded-md">
                    {icon}
                </div>
                <h3 className="font-medium text-sm text-[var(--muted-foreground)]">{title}</h3>
            </div>

            <div className="mt-8 relative flex items-center justify-center">
                <svg
                    height={radius * 2 + 20}
                    width={radius * 2 + 20}
                    className="transform -rotate-90"
                >
                    <circle
                        stroke="currentColor"
                        fill="transparent"
                        strokeWidth={stroke}
                        strokeDasharray={circumference + ' ' + circumference}
                        style={{ strokeDashoffset: 0 }}
                        r={normalizedRadius}
                        cx={radius + 10}
                        cy={radius + 10}
                        className="text-[var(--border)] opacity-20"
                    />
                    <circle
                        stroke="currentColor"
                        fill="transparent"
                        strokeWidth={stroke}
                        strokeDasharray={circumference + ' ' + circumference}
                        style={{ strokeDashoffset }}
                        r={normalizedRadius}
                        cx={radius + 10}
                        cy={radius + 10}
                        className={cn(
                            "transition-all duration-1000 ease-out",
                            percent > 90 ? "text-[var(--error)]" : "text-[var(--primary)]"
                        )}
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-bold tracking-tighter text-[var(--foreground)]">{percent}%</span>
                </div>
            </div>

            <div className="mt-4 text-center">
                <div className="text-xl font-bold text-[var(--foreground)]">
                    {formattedUsed} <span className="text-sm text-[var(--muted-foreground)] font-normal">{unit}</span>
                </div>
                <div className="text-xs text-[var(--muted-foreground)] mt-1">
                    of {formattedLimit} {unit && limit !== Infinity ? unit : ''}
                </div>
            </div>
        </div>
    );
}
