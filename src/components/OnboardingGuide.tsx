'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, GitBranch, Settings, Globe, ArrowRight, Rocket } from 'lucide-react';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { cn } from '@/lib/utils';

export function OnboardingGuide() {
    const steps = [
        {
            title: 'Connect GitHub',
            description: 'Successfully connected your GitHub account',
            icon: CheckCircle2,
            status: 'completed',
        },
        {
            title: 'Import Project',
            description: 'Select a repository to deploy',
            icon: GitBranch,
            status: 'active',
        },
        {
            title: 'Configure',
            description: 'Set environment variables and settings',
            icon: Settings,
            status: 'pending',
        },
        {
            title: 'Deploy',
            description: 'Your site goes live globally',
            icon: Globe,
            status: 'pending',
        },
    ];

    return (
        <div className="relative w-full min-h-[500px] rounded-xl bg-[var(--card)] overflow-hidden border border-[var(--border)] flex flex-col items-center justify-center text-center p-8 shadow-glow">
            <BackgroundBeams className="opacity-50" />

            <div className="relative z-10 max-w-4xl w-full mx-auto space-y-12">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col items-center gap-6"
                >
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                            <Rocket className="w-8 h-8 text-[var(--primary)]" />
                        </div>
                        <div className="space-y-1">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Welcome</span>
                            <h1 className="text-[8px] md:text-[10px] font-bold tracking-tight">Welcome to Deployify</h1>
                        </div>
                    </div>
                    <p className="text-[var(--muted-foreground)] text-[10px] max-w-lg mx-auto">
                        Deploy your Next.js applications in minutes. Just import your repository and we handle the rest.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
                    {/* Connecting line for desktop */}
                    <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-[var(--border)] -z-10 -translate-y-1/2" />

                    {steps.map((step, index) => (
                        <motion.div
                            key={step.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="relative flex flex-col items-center gap-4 group"
                        >
                            <div className={cn(
                                "w-12 h-12 rounded-2xl flex items-center justify-center border-2 z-10 transition-colors duration-300 bg-[var(--card)]",
                                step.status === 'completed' ? "border-[var(--success)] text-[var(--success)]" :
                                step.status === 'active' ? "border-[var(--info)] text-[var(--info)] shadow-[0_0_15px_var(--info-bg)]" :
                                "border-[var(--border)] text-[var(--muted)]"
                            )}>
                                <step.icon className="w-5 h-5" />
                            </div>

                            <div className="space-y-1">
                                <h3 className={cn(
                                    "font-bold text-[8px] uppercase tracking-wider transition-colors",
                                    step.status === 'completed' ? "text-[var(--success)]" :
                                    step.status === 'active' ? "text-[var(--info)]" :
                                    "text-[var(--muted-foreground)]"
                                )}>
                                    {step.title}
                                </h3>
                                <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] max-w-[140px] mx-auto hidden md:block">
                                    {step.description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className="pt-8"
                >
                    <Link href="/new">
                        <MovingBorderButton
                            containerClassName="h-14 w-52"
                            className="text-[8px] font-bold uppercase tracking-wider"
                        >
                            <span className="flex items-center gap-2">
                                Import Project
                                <ArrowRight className="w-4 h-4" />
                            </span>
                        </MovingBorderButton>
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}
