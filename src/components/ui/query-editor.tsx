'use client';

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = e.currentTarget.selectionStart;
            const end = e.currentTarget.selectionEnd;

            // set textarea value to: text before caret + tab + text after caret
            const newValue = value.substring(0, start) + '    ' + value.substring(end);
            onChange(newValue);

            // put caret at right position again
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
                }
            }, 0);
        }
    };

    const handleScroll = () => {
        if (textareaRef.current && lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    };

    useEffect(() => {
        handleScroll();
    }, [value]);

    return (
        <div className={cn(
            "relative flex rounded-xl bg-[var(--background)] border border-[var(--border)] font-mono text-sm focus-within:ring-2 focus-within:ring-[var(--primary)]/50 overflow-hidden",
            className
        )}>
            {/* Line Numbers */}
            <div
                ref={lineNumbersRef}
                className="w-10 bg-[var(--muted)]/20 border-r border-[var(--border)] py-4 text-right pr-2 text-[10px] font-bold text-[var(--muted-foreground)]/40 select-none overflow-hidden"
            >
                {Array.from({ length: lineCount }).map((_, i) => (
                    <div key={i} className="h-5 leading-5">
                        {i + 1}
                    </div>
                ))}
            </div>

            {/* Editor */}
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                placeholder={placeholder}
                spellCheck={false}
                className="flex-1 h-32 p-4 bg-transparent border-none resize-none focus:outline-none custom-scrollbar leading-5 whitespace-pre overflow-x-auto"
            />
        </div>
    );
}
