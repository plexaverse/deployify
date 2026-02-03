import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Rocket, Github } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { Spotlight } from '@/components/ui/spotlight';
import { BackgroundBeams } from '@/components/ui/background-beams';

export default async function LoginPage() {
    // Redirect if already logged in
    const session = await getSession();
    if (session) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-black/[0.96] antialiased relative overflow-hidden flex items-center justify-center p-4">
            <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="white" />
            <main id="main-content" className="w-full max-w-md relative z-10">
                <div className="flex items-center justify-center gap-2 mb-8">
                    <Rocket className="w-10 h-10 text-[var(--primary)]" />
                    <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">Deployify</span>
                </div>

                <div className="card-glass p-8 rounded-3xl">
                    <h1 className="text-2xl font-bold text-center mb-2 text-[var(--foreground)]">Welcome back</h1>
                    <p className="text-[var(--muted-foreground)] text-center mb-8">Sign in to manage your deployments</p>

                    <Link
                        href="/api/auth/github"
                        prefetch={false}
                        className="w-full py-4 text-base bg-[var(--foreground)] text-[var(--background)] rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                        aria-label="Sign in with GitHub"
                    >
                        <Github className="w-5 h-5" />
                        Continue with GitHub
                    </Link>

                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border)]"></div></div>
                        <div className="relative flex justify-center text-[10px] uppercase tracking-widest text-[var(--muted)] font-mono">
                            <span className="px-4 bg-transparent">Secure OAuth 2.0</span>
                        </div>
                    </div>

                    <p className="text-center text-xs text-[var(--muted-foreground)] leading-relaxed">
                        By signing in, you agree to our{' '}
                        <Link href="/terms" className="text-[var(--primary)] hover:underline">Terms</Link> and{' '}
                        <Link href="/privacy" className="text-[var(--primary)] hover:underline">Privacy</Link>
                    </p>
                </div>
                <p className="text-center mt-8">
                    <Link href="/" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">← Back to home</Link>
                </p>
            </main>
            <BackgroundBeams />
        </div>
    );
}
