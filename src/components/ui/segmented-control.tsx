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
    'aria-label'?: string;
}

export function SegmentedControl<T extends string = string>({
    options,
    value,
    onChange,
    className,
    'aria-label': ariaLabel
}: SegmentedControlProps<T>) {
    const layoutId = useId();
    const isFullWidth = className?.includes('w-full');
    const containerRef = useRef<HTMLDivElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const currentIndex = options.findIndex(opt => opt.value === value);
        let nextIndex = -1;

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % options.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            nextIndex = (currentIndex - 1 + options.length) % options.length;
        } else if (e.key === 'Home') {
            nextIndex = 0;
        } else if (e.key === 'End') {
            nextIndex = options.length - 1;
        }

        if (nextIndex !== -1) {
            e.preventDefault();
            const nextValue = options[nextIndex].value;
            onChange(nextValue);

            // Focus management with roving tabindex pattern
            requestAnimationFrame(() => {
                const buttons = containerRef.current?.querySelectorAll('button');
                buttons?.[nextIndex]?.focus();
            });
        }
    };

    return (
        <div
            ref={containerRef}
            role="radiogroup"
            aria-label={ariaLabel}
            onKeyDown={handleKeyDown}
            className={cn(
                "flex p-1 bg-[var(--card)]/50 backdrop-blur-xl border border-[var(--border)] rounded-full w-fit",
                className
            )}
        >
            {options.map((option) => {
                const isActive = value === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)] focus-visible:ring-offset-2 ring-offset-[var(--background)]",
                            isFullWidth && "flex-1 flex items-center justify-center",
                            isActive ? "text-[var(--background)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        )}
                    >
                        {isActive && (
                            <motion.div
                                layoutId={layoutId}
                                aria-hidden="true"
                                className="absolute inset-0 bg-[var(--foreground)] rounded-full shadow-sm"
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
