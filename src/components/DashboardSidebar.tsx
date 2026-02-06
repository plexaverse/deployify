'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

interface DashboardSidebarProps {
    session: Session;
}

export function DashboardSidebar({ session }: DashboardSidebarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Close sidebar on route change on mobile
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    const navGroups = [
        {
            label: 'Platform',
            items: [
                { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
                { name: 'Deployments', href: '/dashboard', icon: Layers },
                { name: 'Analytics', href: '/dashboard', icon: BarChart3 },
            ]
        },
        {
            label: 'Settings',
            items: [
                { name: 'Billing', href: '/billing', icon: CreditCard },
                { name: 'Settings', href: '/dashboard/settings', icon: Settings },
            ]
        }
    ];

    return (
        <>
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between p-4 bg-[var(--card)] border-b border-[var(--border)] h-16">
                 <Link href="/dashboard" className="flex items-center gap-2">
                    <Rocket className="w-6 h-6 text-[var(--primary)]" />
                    <span className="text-xl font-bold gradient-text">Deployify</span>
                 </Link>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="p-2 text-[var(--foreground)]"
                    aria-label="Toggle menu"
                >
                    {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </div>

            {/* Sidebar Overlay for Mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden pt-16"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col transition-transform duration-300 ease-in-out shadow-xl md:shadow-none
                md:static md:translate-x-0 md:h-screen md:z-0
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
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
                                            <Link
                                                href={item.href}
                                                className={`flex items-center gap-3 px-3 py-3 md:py-2 rounded-md text-sm transition-colors ${
                                                    isActive
                                                    ? 'bg-[var(--background)] text-[var(--foreground)] font-medium'
                                                    : 'text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)]'
                                                }`}
                                                onClick={() => setIsOpen(false)}
                                            >
                                                <item.icon className="w-4 h-4" />
                                                {item.name}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>

                {/* User / Footer */}
                <div className="p-4 border-t border-[var(--border)]">
                    <div
                        className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-[var(--background)] cursor-pointer text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mb-2"
                        onClick={toggleTheme}
                    >
                         <span className="flex items-center gap-2">
                            {mounted && theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                            Theme
                         </span>
                    </div>

                    <div className="flex items-center gap-3 px-3 py-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={session.user.avatarUrl}
                            alt={session.user.githubUsername}
                            className="w-8 h-8 rounded-full border border-[var(--border)]"
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-[var(--foreground)]">
                                {session.user.name || session.user.githubUsername}
                            </p>
                            <p className="text-xs text-[var(--muted-foreground)] truncate">
                                @{session.user.githubUsername}
                            </p>
                        </div>
                    </div>
                     <Link
                        href="/api/auth/logout"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--error)] transition-colors mt-1"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign out
                    </Link>
                </div>
            </aside>
        </>
    );
}
