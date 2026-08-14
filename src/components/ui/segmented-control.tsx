'use client';

import React, { useId } from 'react';
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
    ariaLabel?: string;
}

export function SegmentedControl<T extends string = string>({ options, value, onChange, className, ariaLabel }: SegmentedControlProps<T>) {
    const layoutId = useId();
    const isFullWidth = className?.includes('w-full');

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = (index + 1) % options.length;
            onChange(options[nextIndex].value);
            (e.currentTarget.parentElement?.children[nextIndex] as HTMLElement)?.focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = (index - 1 + options.length) % options.length;
            onChange(options[prevIndex].value);
            (e.currentTarget.parentElement?.children[prevIndex] as HTMLElement)?.focus();
        }
    };

    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className={cn(
                "flex p-1 bg-[var(--card)]/50 backdrop-blur-xl border border-[var(--border)] rounded-full w-fit",
                className
            )}
        >
            {options.map((option, index) => {
                const isActive = value === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onChange(option.value)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        className={cn(
                            "relative px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/40",
                            isFullWidth && "flex-1 flex items-center justify-center",
                            isActive ? "text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        )}
                    >
                        {isActive && (
                            <motion.div
                                layoutId={layoutId}
                                className="absolute inset-0 bg-[var(--primary)] rounded-full shadow-sm"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                            />
                        )}
                        <span className="relative z-10">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
