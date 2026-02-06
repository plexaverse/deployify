'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import React from 'react';

export function Header() {
    const pathname = usePathname();

    const getBreadcrumbs = () => {
        if (!pathname) return [];

        const segments = pathname.split('/').filter(Boolean);
        const breadcrumbs = segments.map((segment, index) => {
            const href = `/${segments.slice(0, index + 1).join('/')}`;
            const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
            return { href, label };
        });

        return breadcrumbs;
    };

    const breadcrumbs = getBreadcrumbs();

    return (
        <header className="sticky top-0 z-30 flex items-center w-full h-16 px-6 bg-[var(--background)]/80 backdrop-blur-md border-b border-[var(--border)]">
            <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-sm text-[var(--muted-foreground)]">
                <Link
                    href="/dashboard"
                    className="flex items-center hover:text-[var(--foreground)] transition-colors"
                >
                    <Home className="w-4 h-4" />
                </Link>

                {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.href}>
                        <ChevronRight className="w-4 h-4 text-[var(--muted)]" />
                        <Link
                            href={crumb.href}
                            className={`hover:text-[var(--foreground)] transition-colors ${
                                index === breadcrumbs.length - 1
                                    ? 'text-[var(--foreground)] font-medium'
                                    : ''
                            }`}
                        >
                            {crumb.label}
                        </Link>
                    </React.Fragment>
                ))}
            </nav>
        </header>
    );
}
