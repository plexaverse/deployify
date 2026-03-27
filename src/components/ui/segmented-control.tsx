'use client';

import React, { useId, useRef, useEffect } from 'react';
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
    const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => {
        buttonRefs.current = buttonRefs.current.slice(0, options.length);
    }, [options]);

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        let nextIndex: number | null = null;
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = (index - 1 + options.length) % options.length;
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = (index + 1) % options.length;
                break;
            case 'Home':
                e.preventDefault();
                nextIndex = 0;
                break;
            case 'End':
                e.preventDefault();
                nextIndex = options.length - 1;
                break;
        }

        if (nextIndex !== null) {
            onChange(options[nextIndex].value);
            buttonRefs.current[nextIndex]?.focus();
        }
    };

    return (
        <div
            role="radiogroup"
            className={cn(
                "flex p-1 bg-[var(--card)]/80 border border-[var(--border)] rounded-full w-fit backdrop-blur-xl shadow-lg",
                className
            )}
        >
            {options.map((option, index) => {
                const isActive = value === option.value;
                return (
                    <motion.button
                        key={option.value}
                        ref={(el) => {
                            buttonRefs.current[index] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        tabIndex={isActive ? 0 : -1}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onChange(option.value)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        className={cn(
                            "relative px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
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
