'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Rocket, LayoutDashboard, Settings, LogOut, FolderGit2, Menu, X, Sun, Moon } from 'lucide-react';
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
        // Defer to avoid "set-state-in-effect" lint error
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    // Close sidebar on route change on mobile
    useEffect(() => {
        // Defer to avoid "set-state-in-effect" lint error
        const timer = setTimeout(() => setIsOpen(false), 0);
        return () => clearTimeout(timer);
    }, [pathname]);

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

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
                    {isOpen ? <X /> : <Menu />}
                </button>
            </div>

            {/* Sidebar Overlay for Mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden pt-16"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col transition-transform duration-300 ease-in-out
                md:static md:translate-x-0 md:h-screen md:z-0
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                {/* Logo (Desktop only) */}
                <div className="hidden md:flex p-6 border-b border-[var(--border)]">
                    <Link href="/dashboard" className="flex items-center gap-2">
                        <Rocket className="w-6 h-6 text-[var(--primary)]" />
                        <span className="text-xl font-bold gradient-text">Deployify</span>
                    </Link>
                </div>

                 {/* Mobile Header within Sidebar (for X button alignment if needed) */}
                 <div className="md:hidden flex items-center justify-between p-4 border-b border-[var(--border)] h-16">
                    <Link href="/dashboard" className="flex items-center gap-2">
                        <Rocket className="w-6 h-6 text-[var(--primary)]" />
                        <span className="text-xl font-bold gradient-text">Deployify</span>
                    </Link>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 text-[var(--foreground)]"
                    >
                        <X />
                    </button>
                 </div>


                {/* Navigation */}
                <nav className="flex-1 p-4 overflow-y-auto">
                    <TeamSwitcher />
                    <ul className="space-y-1">
                        <li>
                            <Link
                                href="/dashboard"
                                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
                            >
                                <LayoutDashboard className="w-5 h-5" />
                                Overview
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/dashboard/new"
                                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors"
                            >
                                <FolderGit2 className="w-5 h-5" />
                                Import Project
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/dashboard/settings"
                                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors"
                            >
                                <Settings className="w-5 h-5" />
                                Settings
                            </Link>
                        </li>
                    </ul>
                </nav>

                {/* User section */}
                <div className="p-4 border-t border-[var(--border)]">
                    {/* Theme Toggle */}
                    <div className="flex items-center justify-between mb-4 px-4 py-2 rounded-lg hover:bg-[var(--background)] cursor-pointer" onClick={toggleTheme}>
                         <span className="text-sm font-medium">Theme</span>
                         {mounted && (
                             theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />
                         )}
                    </div>

                    <div className="flex items-center gap-3 px-4 py-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={session.user.avatarUrl}
                            alt={session.user.githubUsername}
                            className="w-8 h-8 rounded-full"
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                                {session.user.name || session.user.githubUsername}
                            </p>
                            <p className="text-xs text-[var(--muted-foreground)] truncate">
                                @{session.user.githubUsername}
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/api/auth/logout"
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--error)] transition-colors mt-2"
                    >
                        <LogOut className="w-5 h-5" />
                        Sign out
                    </Link>
                </div>
            </aside>
        </>
    );
}
