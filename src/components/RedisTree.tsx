'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Key, Folder } from 'lucide-react';
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
    const buildTree = (keys: string[]): TreeNode => {
        const root: TreeNode = { name: 'root', fullName: '', isKey: false, children: {} };

        keys.forEach(key => {
            // Support both : and / as delimiters
            const parts = key.split(/[:/]/);
            let current = root;

            parts.forEach((part, index) => {
                const isLast = index === parts.length - 1;
                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        fullName: parts.slice(0, index + 1).join(key.includes(':') ? ':' : '/'),
                        isKey: isLast,
                        children: {}
                    };
                }
                current = current.children[part];
            });
        });

        return root;
    };

    const tree = buildTree(keys);

    return (
        <div className="space-y-1">
            {Object.values(tree.children).map(node => (
                <TreeNodeComponent key={node.fullName} node={node} onKeyClick={onKeyClick} depth={0} />
            ))}
        </div>
    );
}

function TreeNodeComponent({ node, onKeyClick, depth }: { node: TreeNode, onKeyClick: (key: string) => void, depth: number }) {
    const [isOpen, setIsOpen] = useState(false);
    const hasChildren = Object.keys(node.children).length > 0;

    return (
        <div className="space-y-1">
            <button
                onClick={() => {
                    if (hasChildren) {
                        setIsOpen(!isOpen);
                    } else if (node.isKey) {
                        onKeyClick(node.fullName);
                    }
                }}
                className={cn(
                    "w-full flex items-center gap-2 px-2 py-1 rounded-lg transition-colors text-left group",
                    node.isKey ? "hover:bg-[var(--primary)]/10" : "hover:bg-[var(--muted)]/20"
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
                {hasChildren ? (
                    isOpen ? <ChevronDown className="w-3 h-3 text-[var(--muted-foreground)]" /> : <ChevronRight className="w-3 h-3 text-[var(--muted-foreground)]" />
                ) : (
                    <div className="w-3" />
                )}

                {hasChildren ? (
                    <Folder className="w-3.5 h-3.5 text-[var(--primary)]/60" />
                ) : (
                    <Key className="w-3.5 h-3.5 text-[var(--success)]/60" />
                )}

                <span className={cn(
                    "text-[10px] font-mono tracking-wider truncate",
                    node.isKey ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)] uppercase font-bold"
                )}>
                    {node.name}
                </span>

                {node.isKey && (
                    <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--primary)]" />
                )}
            </button>

            {hasChildren && isOpen && (
                <div className="animate-in slide-in-from-left-1 duration-200">
                    {Object.values(node.children).map(child => (
                        <TreeNodeComponent key={child.fullName} node={child} onKeyClick={onKeyClick} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}
