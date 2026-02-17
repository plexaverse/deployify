import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LandingPage from '@/components/LandingPage';

export default async function Page() {
  const session = await getSession();

  if (session) {
    redirect('/dashboard');
  }

  return <LandingPage />;
}
