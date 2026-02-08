'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, GitBranch, Settings, Globe, ArrowRight } from 'lucide-react';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { Button } from '@/components/ui/moving-border';
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
        <div className="relative w-full min-h-[500px] rounded-xl bg-neutral-950 overflow-hidden border border-neutral-800 flex flex-col items-center justify-center text-center p-8 md:p-12">
            <BackgroundBeams className="opacity-50" />

            <div className="relative z-10 max-w-4xl w-full mx-auto space-y-12">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-4"
                >
                    <h2 className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                        Welcome to Deployify
                    </h2>
                    <p className="text-neutral-400 text-lg max-w-lg mx-auto">
                        Deploy your Next.js applications in minutes. Just import your repository and we handle the rest.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
                    {/* Connecting line for desktop */}
                    <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-neutral-800 -z-10 -translate-y-1/2" />

                    {steps.map((step, index) => (
                        <motion.div
                            key={step.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="relative flex flex-col items-center gap-4 group"
                        >
                            <div className={cn(
                                "w-12 h-12 rounded-full flex items-center justify-center border-2 z-10 transition-colors duration-300 bg-neutral-950",
                                step.status === 'completed' ? "border-emerald-500 text-emerald-500" :
                                step.status === 'active' ? "border-indigo-500 text-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]" :
                                "border-neutral-800 text-neutral-600"
                            )}>
                                <step.icon className="w-5 h-5" />
                            </div>

                            <div className="space-y-1">
                                <h3 className={cn(
                                    "font-semibold text-sm transition-colors",
                                    step.status === 'completed' ? "text-emerald-400" :
                                    step.status === 'active' ? "text-indigo-400" :
                                    "text-neutral-500"
                                )}>
                                    {step.title}
                                </h3>
                                <p className="text-xs text-neutral-500 max-w-[140px] mx-auto hidden md:block">
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
                        <Button
                            borderRadius="1.75rem"
                            className="bg-neutral-900 text-white border-neutral-800 text-base font-semibold"
                            containerClassName="h-14 w-48"
                        >
                            <span className="flex items-center gap-2">
                                Import Project
                                <ArrowRight className="w-4 h-4" />
                            </span>
                        </Button>
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}
