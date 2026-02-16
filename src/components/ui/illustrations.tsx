import React from 'react';

export function NoProjectsIllustration({ className, ...props }: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            {...props}
        >
            <circle cx="100" cy="100" r="90" fill="currentColor" fillOpacity="0.05" />
            <rect x="60" y="70" width="80" height="60" rx="8" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
            <path d="M90 90H110" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M90 110H110" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="100" cy="100" r="15" fill="currentColor" fillOpacity="0.1" />
            <path d="M100 95V105M95 100H105" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function NoDeploymentsIllustration({ className, ...props }: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            {...props}
        >
            <circle cx="100" cy="100" r="90" fill="currentColor" fillOpacity="0.05" />
            <path d="M70 140L100 60L130 140" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M100 60V140" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
            <circle cx="100" cy="60" r="4" fill="currentColor" />
            <circle cx="70" cy="140" r="4" fill="currentColor" />
            <circle cx="130" cy="140" r="4" fill="currentColor" />
            <path d="M140 80L160 80" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M145 90L160 90" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function NoEnvVarsIllustration({ className, ...props }: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            {...props}
        >
            <circle cx="100" cy="100" r="90" fill="currentColor" fillOpacity="0.05" />
            <rect x="65" y="75" width="70" height="50" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M80 75V65C80 60 85 55 90 55H110C115 55 120 60 120 65V75" stroke="currentColor" strokeWidth="2" />
            <circle cx="100" cy="100" r="4" fill="currentColor" />
            <path d="M100 100V110" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}

export function NoDomainsIllustration({ className, ...props }: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            {...props}
        >
            <circle cx="100" cy="100" r="90" fill="currentColor" fillOpacity="0.05" />
            <circle cx="100" cy="100" r="30" stroke="currentColor" strokeWidth="2" />
            <path d="M70 100H130" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
            <ellipse cx="100" cy="100" rx="15" ry="30" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
            <path d="M135 70L150 55" stroke="currentColor" strokeWidth="2" />
            <path d="M150 55L160 65" stroke="currentColor" strokeWidth="2" />
            <path d="M150 55L140 45" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}
