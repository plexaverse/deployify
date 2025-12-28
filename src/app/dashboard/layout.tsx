import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { Rocket, LayoutDashboard, Settings, LogOut, FolderGit2 } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Get session - middleware already verified cookie exists
    // If session is invalid, user will see layout but API calls will fail
    const session = await getSession();

    // If no session, render a minimal layout that will redirect client-side
    if (!session) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <p className="text-[var(--muted-foreground)]">Redirecting to login...</p>
                    <script dangerouslySetInnerHTML={{ __html: `window.location.href = '/login';` }} />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
                {/* Logo */}
                <div className="p-6 border-b border-[var(--border)]">
                    <Link href="/dashboard" className="flex items-center gap-2">
                        <Rocket className="w-6 h-6 text-[var(--primary)]" />
                        <span className="text-xl font-bold gradient-text">Deployify</span>
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4">
                    <ul className="space-y-1">
                        <li>
                            <Link
                                href="/dashboard"
                                prefetch={false}
                                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
                            >
                                <LayoutDashboard className="w-5 h-5" />
                                Overview
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/dashboard/new"
                                prefetch={false}
                                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors"
                            >
                                <FolderGit2 className="w-5 h-5" />
                                Import Project
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/dashboard/settings"
                                prefetch={false}
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
                    <div className="flex items-center gap-3 px-4 py-2">
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
                        prefetch={false}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--error)] transition-colors mt-2"
                    >
                        <LogOut className="w-5 h-5" />
                        Sign out
                    </Link>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 bg-[var(--background)]">
                {children}
            </main>
        </div>
    );
}
