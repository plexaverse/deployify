'use client';

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface QueryEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    suggestions?: string[];
}

export function QueryEditor({ value, onChange, placeholder, className, suggestions = [] }: QueryEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const [filteredSuggestions, setFilteredSuggestions] = React.useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const [cursorPos, setCursorPos] = React.useState({ top: 0, left: 0 });
    const mirrorRef = useRef<HTMLDivElement>(null);
    const [textareaWidth, setTextareaWidth] = React.useState<number | undefined>(undefined);

    const lineCount = value.split('\n').length;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showSuggestions) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % filteredSuggestions.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                applySuggestion(filteredSuggestions[selectedIndex]);
                return;
            }
            if (e.key === 'Escape') {
                setShowSuggestions(false);
                return;
            }
        }

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

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        onChange(newValue);

        const cursor = e.target.selectionStart;
        const textBeforeCursor = newValue.substring(0, cursor);
        const words = textBeforeCursor.split(/[\s,()[\]{}]/);
        const lastWord = words[words.length - 1];

        if (lastWord.length >= 2 && suggestions.length > 0) {
            const filtered = suggestions.filter(s =>
                s.toLowerCase().startsWith(lastWord.toLowerCase()) && s.toLowerCase() !== lastWord.toLowerCase()
            );
            if (filtered.length > 0) {
                setFilteredSuggestions(filtered);
                setSelectedIndex(0);
                setShowSuggestions(true);

                // Improved cursor position calculation using a mirror element
                if (textareaRef.current && mirrorRef.current) {
                    const { selectionStart } = textareaRef.current;
                    const textBefore = newValue.substring(0, selectionStart);

                    // Update mirror content
                    mirrorRef.current.textContent = textBefore;
                    const span = document.createElement('span');
                    span.textContent = '|'; // Marker for cursor
                    mirrorRef.current.appendChild(span);

                    const rect = span.getBoundingClientRect();
                    const parentRect = textareaRef.current.getBoundingClientRect();

                    setCursorPos({
                        top: rect.top - parentRect.top + 25 - textareaRef.current.scrollTop,
                        left: rect.left - parentRect.left + 40
                    });
                }
            } else {
                setShowSuggestions(false);
            }
        } else {
            setShowSuggestions(false);
        }
    };

    const applySuggestion = (suggestion: string) => {
        if (!textareaRef.current) return;
        const cursor = textareaRef.current.selectionStart;
        const textBeforeCursor = value.substring(0, cursor);
        const textAfterCursor = value.substring(cursor);

        const words = textBeforeCursor.split(/([\s,()])/);
        words[words.length - 1] = suggestion;

        const newValue = words.join('') + textAfterCursor;
        onChange(newValue);
        setShowSuggestions(false);

        const newCursorPos = words.join('').length;
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newCursorPos;
                textareaRef.current.focus();
            }
        }, 0);
    };

useEffect(() => {
        handleScroll();
    }, [value]);

    useEffect(() => {
        if (textareaRef.current) {
            setTextareaWidth(textareaRef.current.clientWidth);
        }

        const handleResize = () => {
            if (textareaRef.current) {
                setTextareaWidth(textareaRef.current.clientWidth);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);


    return (
        <div className={cn(
            "relative flex rounded-xl bg-[var(--background)] border border-[var(--border)] font-mono text-sm focus-within:ring-2 focus-within:ring-[var(--primary)]/50 overflow-hidden",
            className
        )}>
            {showSuggestions && (
                <div
                    className="absolute z-50 bg-[var(--popover)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden min-w-[150px]"
                    style={{ top: cursorPos.top, left: cursorPos.left }}
                >
                    {filteredSuggestions.map((s, i) => (
                        <button
                            key={s}
                            onClick={() => applySuggestion(s)}
                            className={cn(
                                "w-full text-left px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                                i === selectedIndex ? "bg-[var(--primary)] text-white" : "hover:bg-[var(--primary)]/10"
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
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
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                placeholder={placeholder}
                spellCheck={false}
                className="flex-1 h-32 p-4 bg-transparent border-none resize-none focus:outline-none custom-scrollbar leading-5 whitespace-pre overflow-x-auto"
            />

            {/* Hidden mirror for position calculation */}
            <div
                ref={mirrorRef}
                className="absolute invisible whitespace-pre p-4 font-mono text-sm leading-5"
                style={{ width: textareaWidth, top: 0, left: 40 }}
            />
        </div>
    );
}
