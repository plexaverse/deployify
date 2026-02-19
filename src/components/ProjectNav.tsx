'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ProjectNavProps {
    projectId: string;
}

export function ProjectNav({ projectId }: ProjectNavProps) {
    const pathname = usePathname();

    const tabs = [
        { name: 'Overview', href: `/dashboard/${projectId}` },
        { name: 'Deployments', href: `/dashboard/${projectId}/deployments` },
        { name: 'Analytics', href: `/dashboard/${projectId}/analytics` },
        { name: 'Logs', href: `/dashboard/${projectId}/logs` },
        { name: 'Settings', href: `/dashboard/${projectId}/settings` },
    ];

    return (
        <div className="border-b border-[var(--border)] bg-[var(--background)]">
            <div className="px-6 md:px-8">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {tabs.map((tab) => {
                        const isActive = pathname === tab.href;
                        return (
                            <Link
                                key={tab.name}
                                href={tab.href}
                                className={cn(
                                    'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                                    isActive
                                        ? 'border-[var(--primary)] text-[var(--foreground)]'
                                        : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border)]'
                                )}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {tab.name}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
