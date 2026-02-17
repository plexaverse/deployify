'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';

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
        <header className="sticky top-0 z-30 flex items-center w-full h-14 px-6 bg-[var(--background)] border-b border-[var(--border)] overflow-x-auto no-scrollbar">
            <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-sm">
                <Link
                    href="/dashboard"
                    className="flex items-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                    aria-label="Dashboard Home"
                >
                    <Home className="w-4 h-4" />
                </Link>

                {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.href}>
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)]" />
                        <Link
                            href={crumb.href}
                            className={cn(
                                "transition-colors whitespace-nowrap",
                                index === breadcrumbs.length - 1
                                    ? 'text-[var(--foreground)] font-medium'
                                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                            )}
                        >
                            {crumb.label}
                        </Link>
                    </React.Fragment>
                ))}
            </nav>
        </header>
    );
}
