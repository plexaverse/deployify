'use client';

import React from 'react';
import Link from 'next/link';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { Button } from '@/components/ui/moving-border';
import { Github, UploadCloud, Rocket } from 'lucide-react';

export function OnboardingGuide() {
    return (
        <div className="relative w-full rounded-3xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
            <div className="h-[500px] w-full relative flex flex-col items-center justify-center antialiased">
                <div className="max-w-2xl mx-auto p-4 relative z-10 text-center">
                    <h1 className="relative z-10 text-lg md:text-4xl bg-clip-text text-transparent bg-gradient-to-b from-[var(--foreground)] to-[var(--muted-foreground)] font-sans font-bold">
                        Welcome to Deployify
                    </h1>
                    <p className="text-[var(--muted-foreground)] max-w-lg mx-auto my-2 text-sm relative z-10">
                        Deploy your Next.js applications in minutes with our Vercel-like experience on your own GCP infrastructure.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 text-left w-full max-w-2xl">
                        <div className="flex flex-col items-center text-center space-y-3 p-4 rounded-xl hover:bg-[var(--muted)]/5 transition-colors">
                            <div className="w-12 h-12 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] shadow-sm border border-[var(--primary)]/20">
                                <Github className="w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-sm">1. Connect GitHub</h3>
                            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">Link your repository to access your projects and start automated deployments.</p>
                        </div>
                        <div className="flex flex-col items-center text-center space-y-3 p-4 rounded-xl hover:bg-[var(--muted)]/5 transition-colors">
                            <div className="w-12 h-12 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] shadow-sm border border-[var(--primary)]/20">
                                <UploadCloud className="w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-sm">2. Configure</h3>
                            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">Set up environment variables, build commands, and resource limits.</p>
                        </div>
                        <div className="flex flex-col items-center text-center space-y-3 p-4 rounded-xl hover:bg-[var(--muted)]/5 transition-colors">
                            <div className="w-12 h-12 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] shadow-sm border border-[var(--primary)]/20">
                                <Rocket className="w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-sm">3. Deploy</h3>
                            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">Push to your git branch and watch your app go live instantly.</p>
                        </div>
                    </div>

                    <div className="mt-12">
                         <Link href="/dashboard/new">
                            <Button
                                borderRadius="1.75rem"
                                className="bg-[var(--background)] text-[var(--foreground)] border-[var(--border)] font-semibold text-sm"
                            >
                                Start Your First Project
                            </Button>
                        </Link>
                    </div>
                </div>
                <BackgroundBeams />
            </div>
        </div>
    );
}
