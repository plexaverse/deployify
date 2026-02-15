import React from 'react';

export function NoProjectsIllustration({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 400 300"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <rect x="50" y="50" width="300" height="200" rx="16" fill="var(--card)" stroke="var(--border)" strokeWidth="2" strokeDasharray="8 8" />
            <circle cx="200" cy="150" r="40" fill="var(--muted)" fillOpacity="0.1" />
            <path d="M180 150H220M200 130V170" stroke="var(--muted-foreground)" strokeWidth="4" strokeLinecap="round" />
            <rect x="80" y="20" width="60" height="60" rx="12" fill="var(--background)" stroke="var(--border)" strokeWidth="2" transform="rotate(-15 110 50)" />
            <rect x="260" y="220" width="50" height="50" rx="10" fill="var(--background)" stroke="var(--border)" strokeWidth="2" transform="rotate(10 285 245)" />
        </svg>
    );
}

export function NoDeploymentsIllustration({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 400 300"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <path d="M200 240V160" stroke="var(--muted)" strokeWidth="2" strokeDasharray="4 4" />
            <circle cx="200" cy="240" r="4" fill="var(--muted)" />

            <path d="M200 120L170 160H230L200 120Z" fill="var(--muted)" fillOpacity="0.1" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M200 120V100" stroke="var(--muted-foreground)" strokeWidth="2" />

            <path d="M100 100C100 70 130 50 160 60C170 30 230 30 240 60C270 50 300 70 300 100" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" strokeDasharray="8 8" />

            <circle cx="280" cy="180" r="30" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
            <path d="M280 180L290 170M270 190L280 180" stroke="var(--muted-foreground)" strokeWidth="2" />
        </svg>
    );
}

export function NoDomainsIllustration({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 400 300"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <circle cx="200" cy="150" r="80" stroke="var(--border)" strokeWidth="2" strokeDasharray="8 8" />
            <ellipse cx="200" cy="150" rx="80" ry="30" stroke="var(--muted)" strokeWidth="2" />
            <ellipse cx="200" cy="150" rx="30" ry="80" stroke="var(--muted)" strokeWidth="2" />

            <rect x="140" y="130" width="120" height="40" rx="20" fill="var(--card)" stroke="var(--primary)" strokeWidth="2" />
            <circle cx="160" cy="150" r="4" fill="var(--primary)" />
            <rect x="180" y="146" width="60" height="8" rx="4" fill="var(--muted)" fillOpacity="0.2" />

            <path d="M280 80L320 120M80 220L120 180" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function NoEnvVarsIllustration({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 400 300"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <rect x="100" y="80" width="200" height="140" rx="8" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
            <path d="M100 120H300" stroke="var(--border)" strokeWidth="2" />

            <rect x="120" y="95" width="40" height="10" rx="2" fill="var(--muted)" fillOpacity="0.3" />
            <rect x="120" y="140" width="60" height="10" rx="2" fill="var(--primary)" fillOpacity="0.2" />
            <rect x="220" y="140" width="100" height="10" rx="2" fill="var(--muted)" fillOpacity="0.1" />

            <rect x="120" y="170" width="50" height="10" rx="2" fill="var(--primary)" fillOpacity="0.2" />
            <rect x="220" y="170" width="80" height="10" rx="2" fill="var(--muted)" fillOpacity="0.1" />

            <circle cx="340" cy="220" r="30" fill="var(--background)" stroke="var(--primary)" strokeWidth="2" />
            <path d="M330 220L340 230L355 210" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
