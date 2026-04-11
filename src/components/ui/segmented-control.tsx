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
}

export function SegmentedControl<T extends string = string>({ options, value, onChange, className, id }: SegmentedControlProps<T>) {
    const layoutId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const isFullWidth = className?.includes('w-full');

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const currentIndex = options.findIndex(opt => opt.value === value);
        let nextIndex = -1;

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
        }

        if (nextIndex !== -1) {
            e.preventDefault();
            onChange(options[nextIndex].value);
            // Focus the newly selected button
            const buttons = containerRef.current?.querySelectorAll('button');
            buttons?.[nextIndex]?.focus();
        }
    };

    return (
        <div
            ref={containerRef}
            id={id}
            role="radiogroup"
            onKeyDown={handleKeyDown}
            className={cn(
                "flex p-1 bg-[var(--card)] border border-[var(--border)] rounded-full w-fit backdrop-blur-xl shadow-lg",
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
                            "relative px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)] focus-visible:ring-offset-2 ring-offset-[var(--card)]",
                            isFullWidth && "flex-1 flex items-center justify-center",
                            isActive ? "text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        )}
                    >
                        {isActive && (
                            <motion.div
                                layoutId={layoutId}
                                className="absolute inset-0 bg-[var(--primary)] rounded-full shadow-sm"
                                transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                            />
                        )}
                        <span className="relative z-10">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
