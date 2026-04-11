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
    const containerRef = useRef<HTMLDivElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const currentIndex = options.findIndex(opt => opt.value === value);
        let nextIndex = -1;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = (currentIndex + 1) % options.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = (currentIndex - 1 + options.length) % options.length;
                break;
            case 'Home':
                e.preventDefault();
                nextIndex = 0;
                break;
            case 'End':
                e.preventDefault();
                nextIndex = options.length - 1;
                break;
            default:
                return;
        }

        if (nextIndex !== -1 && nextIndex !== currentIndex) {
            onChange(options[nextIndex].value);
            // Focus will be handled by useEffect after state change
        }
    };

    useEffect(() => {
        if (containerRef.current) {
            const activeElement = containerRef.current.querySelector('[aria-checked="true"]') as HTMLElement;
            if (activeElement && document.activeElement !== document.body && containerRef.current.contains(document.activeElement)) {
                 // Only shift focus if the user is already interacting with the control
                 activeElement.focus();
            }
        }
    }, [value]);

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
                            "relative px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1",
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
