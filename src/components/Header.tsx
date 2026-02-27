'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home, Search } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

export function Header() {
    const pathname = usePathname();
    const { currentProject } = useStore();

    const getBreadcrumbs = () => {
        if (!pathname) return [];

        const segments = pathname.split('/').filter(Boolean);
        const breadcrumbs = segments.map((segment, index) => {
            const href = `/${segments.slice(0, index + 1).join('/')}`;

            let label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');

            // If the segment matches current project ID, use its name
            if (currentProject && segment === currentProject.id) {
                label = currentProject.name;
            }

            return { href, label };
        });

        return breadcrumbs;
    };

    const breadcrumbs = getBreadcrumbs();
    const [isMac, setIsMac] = useState(false);

    useEffect(() => {
        const isMacDevice = typeof navigator !== 'undefined' && navigator.userAgent.indexOf('Mac') !== -1;
        if (isMacDevice) {
            // Delay to next tick to avoid cascading render lint error
            const timeoutId = setTimeout(() => setIsMac(true), 0);
            return () => clearTimeout(timeoutId);
        }
    }, []);

    const triggerCommandPalette = () => {
        window.dispatchEvent(new CustomEvent('open-command-palette'));
    };

    return (
        <header className="sticky top-0 z-30 flex items-center justify-between w-full h-14 px-6 bg-[var(--background)] border-b border-[var(--border)]">
            <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-sm overflow-x-auto no-scrollbar">
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

            <div className="flex items-center gap-4 ml-4">
                <button
                    onClick={triggerCommandPalette}
                    className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--card)] border border-[var(--border)] hover:border-[var(--border-hover)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all group min-w-[180px]"
                >
                    <Search className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium flex-1 text-left">Search projects...</span>
                    <div className="flex items-center gap-0.5 text-[10px] font-mono opacity-50">
                        <span>{isMac ? '⌘' : 'Ctrl'}</span>
                        <span>K</span>
                    </div>
                </button>
            </div>
        </header>
    );
}
