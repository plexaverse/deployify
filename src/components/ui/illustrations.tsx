import React from 'react';
import { cn } from '@/lib/utils';

interface IllustrationProps {
    className?: string;
}

export function NoDeploymentsIllustration({ className }: IllustrationProps) {
    return (
        <div className={cn("w-full h-40 flex items-center justify-center", className)}>
            <svg
                width="160"
                height="160"
                viewBox="0 0 160 160"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-[var(--primary)] opacity-80"
            >
                <circle cx="80" cy="80" r="60" className="stroke-[var(--border)] stroke-1 fill-[var(--muted)]/5" />
                <path
                    d="M80 30L80 50"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="opacity-20"
                />
                <path
                    d="M80 110L80 130"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="opacity-20"
                />
                <path
                    d="M30 80L50 80"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="opacity-20"
                />
                <path
                    d="M110 80L130 80"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="opacity-20"
                />

                {/* Rocket Body */}
                <path
                    d="M80 45C80 45 60 70 60 95C60 106.046 68.9543 115 80 115C91.0457 115 100 106.046 100 95C100 70 80 45 80 45Z"
                    className="fill-[var(--background)] stroke-currentColor stroke-2"
                />

                {/* Window */}
                <circle cx="80" cy="85" r="8" className="fill-[var(--primary)]/20 stroke-currentColor stroke-2" />

                {/* Fins */}
                <path d="M60 95L50 115H65" className="stroke-currentColor stroke-2 stroke-linejoin-round fill-none" />
                <path d="M100 95L110 115H95" className="stroke-currentColor stroke-2 stroke-linejoin-round fill-none" />

                {/* Flame */}
                <path
                    d="M75 115C75 115 78 135 80 140C82 135 85 115 85 115"
                    className="fill-orange-500/50 stroke-orange-500 stroke-2"
                />
            </svg>
        </div>
    );
}

export function NoDomainsIllustration({ className }: IllustrationProps) {
    return (
        <div className={cn("w-full h-40 flex items-center justify-center", className)}>
            <svg
                width="160"
                height="160"
                viewBox="0 0 160 160"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-[var(--primary)] opacity-80"
            >
                {/* Globe */}
                <circle cx="80" cy="80" r="50" className="stroke-[var(--border)] stroke-1 fill-[var(--muted)]/5" />

                {/* Grid lines */}
                <ellipse cx="80" cy="80" rx="50" ry="20" className="stroke-[var(--muted-foreground)]/20 stroke-1 fill-none" />
                <ellipse cx="80" cy="80" rx="20" ry="50" className="stroke-[var(--muted-foreground)]/20 stroke-1 fill-none" />
                <path d="M30 80H130" className="stroke-[var(--muted-foreground)]/20 stroke-1" />
                <path d="M80 30V130" className="stroke-[var(--muted-foreground)]/20 stroke-1" />

                {/* Connection Points */}
                <circle cx="60" cy="70" r="3" className="fill-[var(--primary)] animate-pulse" />
                <circle cx="100" cy="90" r="3" className="fill-[var(--primary)] animate-pulse delay-75" />
                <circle cx="90" cy="60" r="3" className="fill-[var(--primary)] animate-pulse delay-150" />

                {/* Connection Lines */}
                <path d="M60 70L90 60L100 90" className="stroke-[var(--primary)]/30 stroke-1 fill-none" />
            </svg>
        </div>
    );
}

export function NoEnvVarsIllustration({ className }: IllustrationProps) {
    return (
        <div className={cn("w-full h-40 flex items-center justify-center", className)}>
            <svg
                width="160"
                height="160"
                viewBox="0 0 160 160"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-[var(--primary)] opacity-80"
            >
                {/* Background Shapes */}
                <rect x="40" y="40" width="80" height="80" rx="10" className="stroke-[var(--border)] stroke-1 fill-[var(--muted)]/5" />

                {/* Lock/Key Symbol */}
                <rect x="60" y="70" width="40" height="30" rx="4" className="stroke-currentColor stroke-2 fill-[var(--background)]" />
                <path d="M70 70V60C70 54.4772 74.4772 50 80 50C85.5228 50 90 54.4772 90 60V70" className="stroke-currentColor stroke-2" />
                <circle cx="80" cy="85" r="4" className="fill-[var(--primary)]" />

                {/* Code snippets */}
                <rect x="50" y="100" width="20" height="4" rx="2" className="fill-[var(--muted-foreground)]/20" />
                <rect x="75" y="100" width="35" height="4" rx="2" className="fill-[var(--muted-foreground)]/10" />

                <rect x="50" y="110" width="15" height="4" rx="2" className="fill-[var(--muted-foreground)]/20" />
                <rect x="70" y="110" width="40" height="4" rx="2" className="fill-[var(--muted-foreground)]/10" />
            </svg>
        </div>
    );
}

export function NoProjectsIllustration({ className }: IllustrationProps) {
    return (
        <div className={cn("w-full h-40 flex items-center justify-center", className)}>
            <svg
                width="160"
                height="160"
                viewBox="0 0 160 160"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-[var(--primary)] opacity-80"
            >
                {/* Folder Back */}
                <path d="M30 60L40 40H70L80 60H130V120H30V60Z" className="stroke-[var(--border)] stroke-1 fill-[var(--muted)]/5" />

                {/* Folder Front */}
                <path
                    d="M30 120V70H130V120H30Z"
                    className="stroke-currentColor stroke-2 fill-[var(--background)]"
                />

                {/* Plus Icon */}
                <circle cx="80" cy="95" r="15" className="fill-[var(--primary)]/10 stroke-[var(--primary)] stroke-1" />
                <path d="M80 88V102" className="stroke-[var(--primary)] stroke-2 stroke-linecap-round" />
                <path d="M73 95H87" className="stroke-[var(--primary)] stroke-2 stroke-linecap-round" />
            </svg>
        </div>
    );
}
