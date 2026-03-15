'use client';
import React, { useId, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function SegmentedControl<T extends string>({ options, value, onChange, className }: { options: { value: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
    const layoutId = useId(), containerRef = useRef<HTMLDivElement>(null);
    const handleKeyDown = (e: React.KeyboardEvent) => {
        const i = options.findIndex(o => o.value === value);
        let next = -1;
        if (['ArrowRight', 'ArrowDown'].includes(e.key)) next = (i + 1) % options.length;
        else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) next = (i - 1 + options.length) % options.length;
        if (next !== -1) {
            e.preventDefault(); onChange(options[next].value);
            containerRef.current?.querySelectorAll('button')[next]?.focus();
        }
    };
    return (
        <div ref={containerRef} role="radiogroup" onKeyDown={handleKeyDown} className={cn("flex p-1 bg-[var(--card)]/80 border border-[var(--border)] rounded-full w-fit backdrop-blur-xl", className)}>
            {options.map((opt) => {
                const active = value === opt.value;
                return (
                    <motion.button key={opt.value} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1} whileTap={{ scale: 0.97 }} onClick={() => onChange(opt.value)}
                        className={cn("relative px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                            className?.includes('w-full') && "flex-1 flex items-center justify-center", active ? "text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}>
                        {active && <motion.div layoutId={layoutId} className="absolute inset-0 bg-[var(--foreground)] rounded-full" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
                        <span className="relative z-10">{opt.label}</span>
                    </motion.button>
                );
            })}
        </div>
    );
}
