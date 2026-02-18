'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Keyboard } from 'lucide-react';
import { Portal } from '@/components/ui/portal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function GlobalShortcuts() {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        let lastKeyTime = 0;
        let lastKey = '';

        const handleKeyDown = (e: KeyboardEvent) => {
            const now = Date.now();
            const key = e.key.toLowerCase();
            const target = e.target as HTMLElement;

            // Allow Esc to close modal even if focused on input
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
                return;
            }

            // Ignore if input, textarea, or contentEditable
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            ) {
                return;
            }

            // Show shortcuts
            if (key === '?' && !e.metaKey && !e.ctrlKey) {
                setIsOpen(prev => !prev);
                return;
            }

            // Create New Project
            if (key === 'c' && !e.metaKey && !e.ctrlKey) {
                router.push('/new');
                return;
            }

            // Sequence handling: G then ...
            if (lastKey === 'g' && (now - lastKeyTime < 1000)) {
                if (key === 'h') {
                    router.push('/dashboard');
                    lastKey = ''; // Reset
                    return;
                }
                if (key === 'p') {
                    router.push('/dashboard'); // Projects view is dashboard
                    lastKey = '';
                    return;
                }
            }

            if (key === 'g') {
                lastKey = 'g';
                lastKeyTime = now;
            } else {
                lastKey = '';
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router, isOpen]);

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setIsOpen(false)}>
                <Card className="w-full max-w-md shadow-2xl overflow-hidden p-0" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--card)]">
                        <div className="flex items-center gap-2">
                             <Keyboard className="w-5 h-5 text-[var(--primary)]" />
                            <h3 className="font-semibold text-lg">Keyboard Shortcuts</h3>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsOpen(false)}
                            className="h-8 w-8"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="p-6 space-y-6 bg-[var(--card)]">
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Navigation</h4>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-[var(--foreground)]">Go to Dashboard</span>
                                <div className="flex items-center gap-1.5">
                                    <kbd className="px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-xs font-mono shadow-sm">g</kbd>
                                    <span className="text-[var(--muted-foreground)] text-[10px] uppercase font-bold">then</span>
                                    <kbd className="px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-xs font-mono shadow-sm">h</kbd>
                                </div>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-[var(--foreground)]">Go to Projects</span>
                                <div className="flex items-center gap-1.5">
                                    <kbd className="px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-xs font-mono shadow-sm">g</kbd>
                                    <span className="text-[var(--muted-foreground)] text-[10px] uppercase font-bold">then</span>
                                    <kbd className="px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-xs font-mono shadow-sm">p</kbd>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Actions</h4>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-[var(--foreground)]">Create New Project</span>
                                 <kbd className="px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-xs font-mono shadow-sm">c</kbd>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-[var(--foreground)]">Show Shortcuts</span>
                                 <kbd className="px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-xs font-mono shadow-sm">?</kbd>
                            </div>
                        </div>
                    </div>
                     <div className="p-4 bg-[var(--muted)]/5 border-t border-[var(--border)] text-[10px] text-[var(--muted-foreground)] text-center font-medium">
                        Press <kbd className="px-1.5 py-0.5 border border-[var(--border)] rounded bg-[var(--background)] shadow-sm">Esc</kbd> to close
                    </div>
                </Card>
            </div>
        </Portal>
    );
}
