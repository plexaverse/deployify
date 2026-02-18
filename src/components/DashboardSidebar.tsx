'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { usePathname, useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
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
    Rocket
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
    const { isSidebarOpen, setSidebarOpen, toggleSidebar, isMounted, setMounted } = useStore();
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

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    // Helper to check if a route is a project route
    const isProjectRoute = !!projectId;
    const getProjectHref = (subPath: string = '') => {
        if (!projectId) {
            if (subPath === 'settings') return '/dashboard/settings';
            return '/dashboard';
        }

        // Use /dashboard/[id] for dashboard routes, or /projects/[slug]
        const prefix = params.id ? `/dashboard/${params.id}` : `/projects/${params.slug}`;
        return subPath ? `${prefix}/${subPath}` : prefix;
    };

    const navGroups = [
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
                                        <li key={item.name}>
                                            <motion.div whileTap={{ scale: 0.98 }}>
                                                <Link
                                                    href={item.href}
                                                    className={`flex items-center gap-3 px-3 py-3 md:py-2 rounded-md text-sm transition-colors ${isActive
                                                        ? 'bg-[var(--background)] text-[var(--foreground)] font-medium'
                                                        : 'text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)]'
                                                        }`}
                                                    onClick={() => setSidebarOpen(false)}
                                                >
                                                    <item.icon className="w-4 h-4" />
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
                <div className="p-4 border-t border-[var(--border)]">
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-[var(--background)] cursor-pointer text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mb-2"
                        onClick={toggleTheme}
                        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                    >
                        <span className="flex items-center gap-2">
                            {isMounted && theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                            Theme
                        </span>
                    </motion.button>

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
