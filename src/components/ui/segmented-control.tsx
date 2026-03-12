'use client';

import React, { useId, useEffect, useRef } from 'react';
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
    const containerRef = useRef<HTMLDivElement>(null);
    const isFullWidth = className?.includes('w-full');
    const isFirstRender = useRef(true);

    // Idiomatic React focus management
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const currentIndex = options.findIndex((opt) => opt.value === value);
        if (currentIndex !== -1) {
            const buttons = containerRef.current?.querySelectorAll('button');
            buttons?.[currentIndex]?.focus();
        }
    }, [value, options]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const currentIndex = options.findIndex((opt) => opt.value === value);
        let nextIndex = -1;

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            nextIndex = (currentIndex + 1) % options.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            nextIndex = (currentIndex - 1 + options.length) % options.length;
        }

        if (nextIndex !== -1) {
            onChange(options[nextIndex].value);
        }
    };

    return (
        <div
            ref={containerRef}
            role="radiogroup"
            onKeyDown={handleKeyDown}
            className={cn(
                "flex p-1 bg-[var(--card)] border border-[var(--border)] rounded-full w-fit backdrop-blur-xl",
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
                            "relative px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/20",
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
