'use client';

import React, { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Option {
    value: string;
    label: string;
}

interface SegmentedControlProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

export function SegmentedControl({ options, value, onChange, className }: SegmentedControlProps) {
    const layoutId = useId();

    return (
        <div className={cn(
            "flex p-1 bg-[var(--card)] border border-[var(--border)] rounded-full w-fit",
            className
        )}>
            {options.map((option) => {
                const isActive = value === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors duration-200 focus:outline-none",
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
