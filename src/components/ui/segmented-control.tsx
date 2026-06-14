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
    id?: string;
    'aria-labelledby'?: string;
}

export function SegmentedControl<T extends string = string>({
    options,
    value,
    onChange,
    className,
    id,
    'aria-labelledby': ariaLabelledby
}: SegmentedControlProps<T>) {
    const layoutId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const isFullWidth = className?.includes('w-full');

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const currentIndex = options.findIndex(o => o.value === value);
        let nextIndex = currentIndex;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                nextIndex = (currentIndex + 1) % options.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                nextIndex = (currentIndex - 1 + options.length) % options.length;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = options.length - 1;
                break;
            default:
                return;
        }

        e.preventDefault();
        const nextValue = options[nextIndex].value;
        onChange(nextValue);

        setTimeout(() => {
            const buttons = containerRef.current?.querySelectorAll('button');
            (buttons?.[nextIndex] as HTMLElement)?.focus();
        }, 0);
    };

    return (
        <div
            ref={containerRef}
            id={id}
            role="radiogroup"
            aria-labelledby={ariaLabelledby}
            onKeyDown={handleKeyDown}
            className={cn(
                "flex p-1 bg-[var(--card)]/50 border border-[var(--border)] rounded-full w-fit backdrop-blur-xl shadow-lg",
                className
            )}
        >
            {options.map((option) => {
                const isActive = value === option.value;
                return (
                    <motion.button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        tabIndex={isActive ? 0 : -1}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full transition-colors duration-200 focus:outline-none",
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
