'use client';

import React, { useId, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Option<T extends string = string> {
    value: T;
    label: React.ReactNode;
}

interface SegmentedControlProps<T extends string = string> {
    options: Option<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
}

export function SegmentedControl<T extends string = string>({ options, value, onChange, className }: SegmentedControlProps<T>) {
    const layoutId = useId();
    const isFullWidth = className?.includes('w-full');
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        const keyMap: Record<string, number> = {
            ArrowRight: (index + 1) % options.length, ArrowDown: (index + 1) % options.length,
            ArrowLeft: (index - 1 + options.length) % options.length, ArrowUp: (index - 1 + options.length) % options.length,
            Home: 0, End: options.length - 1
        };
        if (keyMap[e.key] !== undefined) {
            e.preventDefault();
            const nextItem = itemRefs.current[keyMap[e.key]];
            if (nextItem) { nextItem.focus(); onChange(options[keyMap[e.key]].value); }
        }
    };

    return (
        <div role="radiogroup" className={cn("flex p-1 bg-[var(--card)]/50 backdrop-blur-xl border border-[var(--border)] rounded-full w-fit shadow-lg", className)}>
            {options.map((option, i) => {
                const isActive = value === option.value;
                return (
                    <motion.button
                        key={option.value}
                        ref={el => { itemRefs.current[i] = el as HTMLButtonElement; }}
                        whileTap={{ scale: 0.96 }}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onChange(option.value)}
                        onKeyDown={(e) => handleKeyDown(e, i)}
                        className={cn(
                            "relative px-5 py-2 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ring-offset-[var(--card)]",
                            isFullWidth && "flex-1 flex items-center justify-center",
                            isActive ? "text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        )}
                    >
                        {isActive && (
                            <motion.div
                                layoutId={layoutId}
                                className="absolute inset-0 bg-[var(--primary)] rounded-full shadow-md"
                                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                            />
                        )}
                        <span className="relative z-10">{option.label}</span>
                    </motion.button>
                );
            })}
        </div>
    );
}
