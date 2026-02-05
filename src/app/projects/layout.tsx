import { getSession } from '@/lib/auth';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { TeamProvider } from '@/contexts/TeamContext';
import { GlobalShortcuts } from '@/components/GlobalShortcuts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProjectsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

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
       <TeamProvider>
       <div className="min-h-screen flex flex-col md:flex-row">
            <GlobalShortcuts />
            <DashboardSidebar session={session} />
                <main className="flex-1 bg-[var(--background)] pt-16 md:pt-0">
                    {children}
                </main>
            </div>
        </TeamProvider>
    );
}
