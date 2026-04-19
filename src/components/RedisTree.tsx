'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Database, Key, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RedisTreeProps {
    keys: string[];
    onKeyClick: (key: string) => void;
}

interface TreeNode {
    name: string;
    fullName: string;
    isKey: boolean;
    children: Record<string, TreeNode>;
}

export function RedisTree({ keys, onKeyClick }: RedisTreeProps) {
    const tree = useMemo(() => {
        const root: TreeNode = { name: 'root', fullName: '', isKey: false, children: {} };

        keys.forEach(key => {
            const parts = key.split(/[:/]/);
            let current = root;

            parts.forEach((part, index) => {
                const isLast = index === parts.length - 1;
                const fullName = parts.slice(0, index + 1).join(key.includes(':') ? ':' : '/');

                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        fullName,
                        isKey: isLast,
                        children: {}
                    };
                } else if (isLast) {
                    current.children[part].isKey = true;
                }
                current = current.children[part];
            });
        });

        return root;
    }, [keys]);

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
                <Database className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Redis Key Explorer</span>
            </div>
            <div className="pl-1">
                {Object.values(tree.children).sort((a, b) => {
                    if (a.isKey !== b.isKey) return a.isKey ? 1 : -1;
                    return a.name.localeCompare(b.name);
                }).map(node => (
                    <TreeItem key={node.fullName} node={node} onKeyClick={onKeyClick} level={0} />
                ))}
            </div>
        </div>
    );
}

function TreeItem({ node, onKeyClick, level }: { node: TreeNode; onKeyClick: (key: string) => void; level: number }) {
    const [isOpen, setIsOpen] = useState(false);
    const hasChildren = Object.keys(node.children).length > 0;

    return (
        <div className="select-none">
            <div
                onClick={() => {
                    if (hasChildren) setIsOpen(!isOpen);
                    if (node.isKey) onKeyClick(node.fullName);
                }}
                className={cn(
                    "flex items-center gap-1.5 py-1 px-2 rounded-lg cursor-pointer transition-colors group",
                    node.isKey ? "hover:bg-[var(--primary)]/10" : "hover:bg-[var(--muted)]/10"
                )}
            >
                <div className="w-4 flex items-center justify-center">
                    {hasChildren && (
                        isOpen ? <ChevronDown className="w-3 h-3 text-[var(--muted-foreground)]" /> : <ChevronRight className="w-3 h-3 text-[var(--muted-foreground)]" />
                    )}
                </div>
                {hasChildren ? (
                    <Folder className={cn("w-3.5 h-3.5", isOpen ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]/60")} />
                ) : (
                    <Key className="w-3.5 h-3.5 text-[var(--success)]/60" />
                )}
                <span className={cn(
                    "text-[7px] font-mono truncate",
                    node.isKey ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)] font-bold uppercase tracking-wider"
                )}>
                    {node.name}
                </span>
                {node.isKey && (
                    <span className="ml-auto opacity-0 group-hover:opacity-100 text-[7px] font-bold uppercase text-[var(--primary)] transition-opacity">
                        Fetch
                    </span>
                )}
            </div>

            {isOpen && hasChildren && (
                <div className="ml-4 border-l border-[var(--border)] pl-1 mt-1 space-y-1">
                    {Object.values(node.children).sort((a, b) => {
                        if (a.isKey !== b.isKey) return a.isKey ? 1 : -1;
                        return a.name.localeCompare(b.name);
                    }).map(child => (
                        <TreeItem key={child.fullName} node={child} onKeyClick={onKeyClick} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}
