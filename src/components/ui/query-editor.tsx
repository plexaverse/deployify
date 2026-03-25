'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface QueryEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export function QueryEditor({ value, onChange, placeholder, className }: QueryEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    const lineCount = value.split('\n').length;

    const handleScroll = () => {
        if (textareaRef.current && lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = e.currentTarget.selectionStart;
            const end = e.currentTarget.selectionEnd;
            const newValue = value.substring(0, start) + '    ' + value.substring(end);
            onChange(newValue);

            // Set cursor position after update
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
                }
            }, 0);
        }
    };

    return (
        <div className={`relative flex font-mono text-sm bg-[var(--background)] border border-[var(--border)] rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[var(--primary)]/50 ${className}`}>
            {/* Line Numbers */}
            <div
                ref={lineNumbersRef}
                className="w-10 bg-[var(--muted)]/20 border-r border-[var(--border)] py-4 flex flex-col items-center select-none overflow-hidden text-[10px] font-bold text-[var(--muted-foreground)]/40"
            >
                {Array.from({ length: Math.max(lineCount, 5) }).map((_, i) => (
                    <div key={i} className="h-[1.5rem] leading-[1.5rem]">
                        {i + 1}
                    </div>
                ))}
            </div>

            {/* Textarea */}
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={handleScroll}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                spellCheck={false}
                className="flex-1 p-4 bg-transparent outline-none resize-none leading-[1.5rem] custom-scrollbar min-h-[8rem]"
            />
        </div>
    );
}
