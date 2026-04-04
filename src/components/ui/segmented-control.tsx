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
}

export function SegmentedControl<T extends string = string>({ options, value, onChange, className }: SegmentedControlProps<T>) {
    const layoutId = useId();
    const isFullWidth = className?.includes('w-full');

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                onChange(options[(index + 1) % options.length].value);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                onChange(options[(index - 1 + options.length) % options.length].value);
                break;
            case 'Home':
                e.preventDefault();
                onChange(options[0].value);
                break;
            case 'End':
                e.preventDefault();
                onChange(options[options.length - 1].value);
                break;
        }
    };

    return (
        <div
            role="radiogroup"
            aria-label="Selection"
            className={cn(
                "flex p-1 bg-[var(--card)] border border-[var(--border)] rounded-full w-fit backdrop-blur-xl shadow-lg",
                className
            )}
        >
            {options.map((option, index) => {
                const isActive = value === option.value;
                return (
                    <motion.button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onKeyDown={(e) => handleKeyDown(e, index)}
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
