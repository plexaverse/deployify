'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { usePathname, useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    Settings,
    LogOut,
    Menu,
    X,
    Sun,
    Moon,
    CreditCard,
    BarChart3,
    Layers,
    Rocket,
    FileText
} from 'lucide-react';
import type { Session } from '@/types';
import { TeamSwitcher } from '@/components/TeamSwitcher';
import { PlanBadge } from '@/components/ui/PlanBadge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useStore } from '@/store';

interface DashboardSidebarProps {
    session: Session;
}

export function DashboardSidebar({ session }: DashboardSidebarProps) {
    const { isSidebarOpen, setSidebarOpen, toggleSidebar, setMounted } = useStore();
    const pathname = usePathname();
    const params = useParams();
    const { theme, setTheme } = useTheme();

    // Support both id (dashboard) and slug (projects) params
    const projectId = (params?.id || params?.slug) as string;

    useEffect(() => {
        setMounted(true);
    }, [setMounted]);

    // Close sidebar on route change on mobile
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname, setSidebarOpen]);

    const navGroups = useMemo(() => {
        const getProjectHref = (subPath: string = '') => {
            if (!projectId) {
                if (subPath === 'settings') return '/dashboard/settings';
                return '/dashboard';
            }

            // Use /dashboard/[id] for dashboard routes, or /projects/[slug]
            const prefix = params.id ? `/dashboard/${params.id}` : `/projects/${params.slug}`;
            return subPath ? `${prefix}/${subPath}` : prefix;
        };

        return [
            {
                label: 'Platform',
                items: [
                    {
                        name: 'Overview',
                        href: getProjectHref(),
                        icon: LayoutDashboard
                    },
                    ...(projectId ? [
                        {
                            name: 'Deployments',
                            href: getProjectHref('deployments'),
                            icon: Layers
                        },
                        {
                            name: 'Analytics',
                            href: getProjectHref('analytics'),
                            icon: BarChart3
                        },
                        {
                            name: 'Logs',
                            href: getProjectHref('logs'),
                            icon: FileText
                        },
                    ] : [])
                ]
            },
            {
                label: 'Settings',
                items: [
                    { name: 'Billing', href: '/billing', icon: CreditCard },
                    {
                        name: 'Settings',
                        href: getProjectHref('settings'),
                        icon: Settings
                    },
                ]
            }
        ];
    }, [projectId, params]);

    return (
        <>
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between p-4 bg-[var(--card)] border-b border-[var(--border)] h-16">
                <Link href="/dashboard" className="flex items-center gap-2 group">
                    <Rocket className="w-6 h-6 text-[var(--primary)] group-hover:rotate-12 transition-transform" />
                    <span className="text-xl font-bold gradient-text">Deployify</span>
                </Link>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleSidebar}
                    className="p-2 text-[var(--foreground)]"
                    aria-label="Toggle menu"
                >
                    {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </motion.button>
            </div>

            {/* Sidebar Overlay for Mobile */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden pt-16"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col transition-transform duration-300 ease-in-out shadow-xl md:shadow-none
                md:sticky md:top-0 md:translate-x-0 md:h-screen md:z-0
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                {/* Header / Team Switcher */}
                <div className="p-4 border-b border-[var(--border)]">
                    <TeamSwitcher />
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 overflow-y-auto space-y-6">
                    {navGroups.map((group) => (
                        <div key={group.label}>
                            <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 px-2">
                                {group.label}
                            </h3>
                            <ul className="space-y-1">
                                {group.items.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <li key={item.name} className="relative">
                                            {isActive && (
                                                <motion.span
                                                    layoutId="active-nav-indicator"
                                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[var(--primary)] rounded-r-full z-10"
                                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                                />
                                            )}
                                            <motion.div whileTap={{ scale: 0.98 }}>
                                                <Link
                                                    href={item.href}
                                                    className={cn(
                                                        "flex items-center gap-3 px-3 py-3 md:py-2 rounded-md text-sm transition-all duration-200",
                                                        isActive
                                                            ? 'bg-[var(--primary)]/5 text-[var(--foreground)] font-semibold shadow-sm border border-[var(--primary)]/10'
                                                            : 'text-[var(--muted-foreground)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]'
                                                    )}
                                                    onClick={() => setSidebarOpen(false)}
                                                >
                                                    <item.icon className={cn("w-4 h-4", isActive && "text-[var(--primary)]")} />
                                                    {item.name}
                                                </Link>
                                            </motion.div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>

                {/* User / Footer */}
                <div className="p-4 border-t border-[var(--border)] space-y-4">
                    <div className="px-3">
                        <div className="flex items-center justify-between p-1 rounded-lg bg-[var(--muted)]/5 border border-[var(--border)]">
                            <button
                                onClick={() => setTheme('light')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all",
                                    theme === 'light' ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm border border-[var(--border)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                )}
                            >
                                <Sun className="w-3.5 h-3.5" />
                                Light
                            </button>
                            <button
                                onClick={() => setTheme('dark')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all",
                                    theme === 'dark' ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm border border-[var(--border)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                )}
                            >
                                <Moon className="w-3.5 h-3.5" />
                                Dark
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-3 py-2">
                        <Avatar className="h-8 w-8 border border-[var(--border)]">
                            <AvatarImage src={session.user.avatarUrl} alt={session.user.githubUsername} />
                            <AvatarFallback>{session.user.githubUsername.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate text-[var(--foreground)]">
                                    {session.user.name || session.user.githubUsername}
                                </p>
                                {session.user.subscription?.tier && session.user.subscription.tier !== 'free' && (
                                    <PlanBadge tier={session.user.subscription.tier} />
                                )}
                            </div>
                            <p className="text-xs text-[var(--muted-foreground)] truncate">
                                @{session.user.githubUsername}
                            </p>
                        </div>
                    </div>
                    <motion.a
                        whileTap={{ scale: 0.98 }}
                        href="/api/auth/logout"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--error)] transition-colors mt-1"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign out
                    </motion.a>
                </div>
            </aside>
        </>
    );
}
