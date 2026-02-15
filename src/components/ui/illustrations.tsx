import React from 'react';
import { cn } from '@/lib/utils';

interface IllustrationProps {
    className?: string;
}

export function NoProjectsIllustration({ className }: IllustrationProps) {
    return (
        <svg
            viewBox="0 0 200 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("w-full h-auto", className)}
        >
            <rect x="40" y="30" width="120" height="80" rx="8" fill="var(--muted)" fillOpacity="0.1" stroke="var(--border)" strokeWidth="2" strokeDasharray="4 4" />
            <path d="M40 50H160" stroke="var(--border)" strokeWidth="1" />
            <circle cx="50" cy="40" r="3" fill="var(--muted-foreground)" fillOpacity="0.3" />
            <circle cx="60" cy="40" r="3" fill="var(--muted-foreground)" fillOpacity="0.3" />
            <circle cx="70" cy="40" r="3" fill="var(--muted-foreground)" fillOpacity="0.3" />

            <rect x="80" y="55" width="40" height="30" rx="4" fill="var(--background)" stroke="var(--primary)" strokeWidth="2" />
            <path d="M100 65V75M95 70H105" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />

            <path d="M30 60L20 70M170 60L180 70" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            <circle cx="20" cy="70" r="3" fill="var(--muted-foreground)" opacity="0.3" />
            <circle cx="180" cy="70" r="3" fill="var(--muted-foreground)" opacity="0.3" />
        </svg>
    );
}

export function NoDeploymentsIllustration({ className }: IllustrationProps) {
    return (
        <svg
            viewBox="0 0 200 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("w-full h-auto", className)}
        >
            <rect x="50" y="20" width="100" height="80" rx="4" fill="var(--muted)" fillOpacity="0.1" stroke="var(--border)" strokeWidth="2" />
            <path d="M50 40H150" stroke="var(--border)" strokeWidth="1" />
            <rect x="60" y="50" width="80" height="6" rx="3" fill="var(--muted)" fillOpacity="0.2" />
            <rect x="60" y="65" width="60" height="6" rx="3" fill="var(--muted)" fillOpacity="0.2" />
            <rect x="60" y="80" width="70" height="6" rx="3" fill="var(--muted)" fillOpacity="0.2" />

            <circle cx="100" cy="60" r="30" fill="var(--background)" stroke="var(--muted)" strokeWidth="2" />
            <path d="M100 45V60L110 70" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M85 95L100 110L115 95" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function NoDomainsIllustration({ className }: IllustrationProps) {
    return (
        <svg
            viewBox="0 0 200 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("w-full h-auto", className)}
        >
            <circle cx="100" cy="60" r="40" stroke="var(--border)" strokeWidth="2" strokeDasharray="6 6" fill="var(--muted)" fillOpacity="0.05" />
            <ellipse cx="100" cy="60" rx="40" ry="15" stroke="var(--border)" strokeWidth="1" strokeOpacity="0.5" />
            <ellipse cx="100" cy="60" rx="15" ry="40" stroke="var(--border)" strokeWidth="1" strokeOpacity="0.5" />

            <rect x="70" y="50" width="60" height="20" rx="4" fill="var(--background)" stroke="var(--primary)" strokeWidth="2" />
            <text x="100" y="64" textAnchor="middle" fontSize="10" fill="var(--primary)" fontFamily="monospace">www</text>

            <path d="M100 20V10M100 110V100M20 60H10M190 60H180" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>
    );
}

export function NoEnvVarsIllustration({ className }: IllustrationProps) {
    return (
        <svg
            viewBox="0 0 200 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("w-full h-auto", className)}
        >
            <rect x="40" y="20" width="120" height="80" rx="8" fill="var(--muted)" fillOpacity="0.1" stroke="var(--border)" strokeWidth="2" />
            <path d="M40 45H160" stroke="var(--border)" strokeWidth="1" />

            <rect x="55" y="60" width="40" height="8" rx="2" fill="var(--primary)" fillOpacity="0.2" />
            <rect x="105" y="60" width="40" height="8" rx="2" fill="var(--muted)" fillOpacity="0.2" />

            <rect x="55" y="80" width="40" height="8" rx="2" fill="var(--primary)" fillOpacity="0.2" />
            <rect x="105" y="80" width="40" height="8" rx="2" fill="var(--muted)" fillOpacity="0.2" />

            <path d="M115 55L125 55M115 75L125 75" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            <circle cx="150" cy="32" r="6" fill="var(--background)" stroke="var(--primary)" strokeWidth="2" />
            <path d="M148 30L152 34" stroke="var(--primary)" strokeWidth="1.5" />
            <path d="M152 30L148 34" stroke="var(--primary)" strokeWidth="1.5" />
        </svg>
    );
}
