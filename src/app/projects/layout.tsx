import { getSession } from '@/lib/auth';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { TeamProvider } from '@/contexts/TeamContext';
import { GlobalShortcuts } from '@/components/GlobalShortcuts';
import { Header } from '@/components/Header';
import { PageTransition } from '@/components/PageTransition';

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
       <div className="min-h-screen flex flex-col md:flex-row bg-[var(--background)]">
            <GlobalShortcuts />
            <DashboardSidebar session={session} />
                <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--background)] pt-16 md:pt-0">
                    <Header />
                    <div className="flex-1 overflow-y-auto">
                        <PageTransition>
                            <div className="p-6">
                                {children}
                            </div>
                        </PageTransition>
                    </div>
                </main>
            </div>
        </TeamProvider>
    );
}
