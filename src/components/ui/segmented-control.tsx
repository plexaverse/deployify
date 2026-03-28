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
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const activeIndex = options.findIndex(opt => opt.value === value);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        let newIndex = -1;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                newIndex = (activeIndex + 1) % options.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                newIndex = (activeIndex - 1 + options.length) % options.length;
                break;
            case 'Home':
                newIndex = 0;
                break;
            case 'End':
                newIndex = options.length - 1;
                break;
            default:
                return;
        }

        if (newIndex !== -1) {
            e.preventDefault();
            onChange(options[newIndex].value);
            // Defer focus to next frame to allow DOM to update tabIndex
            requestAnimationFrame(() => {
                buttonRefs.current[newIndex]?.focus();
            });
        }
    };

    return (
        <div
            ref={containerRef}
            role="radiogroup"
            onKeyDown={handleKeyDown}
            className={cn(
                "flex p-1 bg-[var(--card)]/50 border border-[var(--border)] rounded-full w-fit backdrop-blur-xl shadow-lg",
                className
            )}
        >
            {options.map((option, idx) => {
                const isActive = value === option.value;
                return (
                    <motion.button
                        key={option.value}
                        ref={(el) => { buttonRefs.current[idx] = el; }}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onChange(option.value)}
                        whileTap={{ scale: 0.97 }}
                        className={cn(
                            "relative px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ring-offset-[var(--background)]",
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
                    </motion.button>
                );
            })}
        </div>
    );
}
