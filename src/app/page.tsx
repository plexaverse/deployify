import { getSession } from '@/lib/auth';
import LandingPage from '@/components/LandingPage';
import DashboardHome from '@/components/DashboardHome';
import { TeamProvider } from '@/contexts/TeamContext';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { Header } from '@/components/Header';
import { GlobalShortcuts } from '@/components/GlobalShortcuts';
import { PageTransition } from '@/components/PageTransition';

export default async function Page() {
  const session = await getSession();

  if (!session) {
    return <LandingPage />;
  }

  return (
    <TeamProvider>
      <div className="min-h-screen flex flex-col md:flex-row bg-[var(--background)]">
        <GlobalShortcuts />
        <DashboardSidebar session={session} />

        <main id="main-content" className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--background)] pt-16 md:pt-0">
           <Header />
           <div className="flex-1 overflow-y-auto">
              <PageTransition>
                 <div className="p-6">
                   <DashboardHome />
                 </div>
              </PageTransition>
           </div>
        </main>
      </div>
    </TeamProvider>
  );
}
