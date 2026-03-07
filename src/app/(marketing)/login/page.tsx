import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Rocket, Github } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { Spotlight } from '@/components/ui/spotlight';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { Card } from '@/components/ui/card';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';

export default async function LoginPage() {
    // Redirect if already logged in
    const session = await getSession();
    if (session) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-[var(--background)] antialiased relative overflow-hidden flex items-center justify-center p-4">
            <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="var(--foreground)" />
            <main id="main-content" className="w-full max-w-md relative z-10 flex flex-col items-center">
                <Card className="w-full overflow-hidden p-0 backdrop-blur-xl bg-[var(--card)]/80 border-[var(--border)] shadow-2xl rounded-[2.5rem]">
                    <div className="p-10 flex flex-col items-center text-center">
                        <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0 mb-6">
                            <Rocket className="w-8 h-8 text-[var(--primary)]" />
                        </div>

                        <div className="space-y-1 mb-8">
                            <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Authentication</span>
                            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
                        </div>

                        <p className="text-[var(--muted-foreground)] text-lg mb-10">Sign in to manage your deployments</p>

                        <Link href="/api/auth/github" prefetch={false} className="w-full">
                            <MovingBorderButton
                                as="div"
                                containerClassName="w-full h-14"
                                className="bg-[var(--foreground)] text-[var(--background)] font-bold text-base flex items-center justify-center gap-2"
                            >
                                <Github className="w-5 h-5" />
                                Continue with GitHub
                            </MovingBorderButton>
                        </Link>

                        <div className="relative w-full my-8">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border)]"></div></div>
                            <div className="relative flex justify-center">
                                <span className="px-4 bg-[var(--card)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Secure OAuth 2.0</span>
                            </div>
                        </div>

                        <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                            By signing in, you agree to our{' '}
                            <Link href="/terms" className="text-[var(--primary)] hover:underline">Terms</Link> and{' '}
                            <Link href="/privacy" className="text-[var(--primary)] hover:underline">Privacy</Link>
                        </p>
                    </div>
                </Card>
                <p className="text-center mt-8">
                    <Link href="/" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">← Back to home</Link>
                </p>
            </main>
            <BackgroundBeams />
        </div>
    );
}
