import { getSession } from '@/lib/auth';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { TeamProvider } from '@/contexts/TeamContext';
import { GlobalShortcuts } from '@/components/GlobalShortcuts';

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
       <TeamProvider>
       <div className="min-h-screen flex flex-col md:flex-row">
            <GlobalShortcuts />
            {/* Sidebar (Client Component) */}
            <DashboardSidebar session={session} />

                {/* Main content */}
                <main className="flex-1 bg-[var(--background)] pt-16 md:pt-0">
                    {children}
                </main>
            </div>
        </TeamProvider>
    );
}
