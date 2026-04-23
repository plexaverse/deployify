'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Activity, AlertTriangle, ArrowDownRight } from 'lucide-react';

interface ExplainNode {
    name: string;
    cost?: string;
    rows?: string;
    width?: string;
    details?: string[];
    children: ExplainNode[];
    isHotspot?: boolean;
}

interface VisualExplainProps {
    data: Record<string, unknown>[];
    type: 'postgres' | 'mysql';
}

export function VisualExplain({ data, type }: VisualExplainProps) {
    const tree = useMemo(() => {
        if (type === 'postgres') {
            return parsePostgresExplain(data);
        } else {
            return parseMysqlExplain(data);
        }
    }, [data, type]);

    if (!tree) return null;

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-[var(--primary)]" />
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Visual Query Plan</span>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-x-auto">
                <ExplainTreeNode node={tree} isRoot />
            </div>
        </div>
    );
}

function ExplainTreeNode({ node, isRoot = false }: { node: ExplainNode; isRoot?: boolean }) {
    return (
        <div className={cn("relative flex flex-col", !isRoot && "ml-8 mt-4")}>
            {!isRoot && (
                <div className="absolute -left-6 top-0 bottom-1/2 w-4 border-l border-b border-[var(--border)] rounded-bl-lg" />
            )}

            <div className={cn(
                "p-3 rounded-lg border transition-all min-w-[250px]",
                node.isHotspot
                    ? "bg-[var(--error)]/5 border-[var(--error)]/30 shadow-[0_0_15px_-5px_var(--error)]"
                    : "bg-[var(--muted)]/5 border-[var(--border)]"
            )}>
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className={cn(
                                "text-[10px] font-bold",
                                node.isHotspot ? "text-[var(--error)]" : "text-[var(--foreground)]"
                            )}>
                                {node.name}
                            </span>
                            {node.isHotspot && (
                                <AlertTriangle className="w-3 h-3 text-[var(--error)]" />
                            )}
                        </div>
                        {node.details && node.details.map((detail, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-[8px] font-bold uppercase text-[var(--muted-foreground)] opacity-70">
                                <ArrowDownRight className="w-2.5 h-2.5" />
                                {detail}
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                        {node.cost && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[8px] font-bold text-[var(--muted-foreground)] uppercase">Cost</span>
                                <span className="text-[8px] font-mono font-bold text-[var(--primary)]">{node.cost}</span>
                            </div>
                        )}
                        {node.rows && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[8px] font-bold text-[var(--muted-foreground)] uppercase">Rows</span>
                                <span className="text-[8px] font-mono font-bold text-[var(--success)]">{node.rows}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {node.children.length > 0 && (
                <div className="flex flex-col">
                    {node.children.map((child, i) => (
                        <ExplainTreeNode key={i} node={child} />
                    ))}
                </div>
            )}
        </div>
    );
}

function parsePostgresExplain(data: Record<string, unknown>[]): ExplainNode | null {
    if (!data || data.length === 0) return null;

    const lines = data.map(row => String(row['QUERY PLAN'] || ''));
    const root: ExplainNode = { name: 'Root', children: [] };
    const stack: { node: ExplainNode; indent: number }[] = [{ node: root, indent: -1 }];

    lines.forEach(line => {
        const indent = line.search(/\S/);
        const cleanLine = line.trim();

        if (cleanLine.startsWith('->')) {
            const content = cleanLine.substring(2).trim();
            const node = parsePostgresLine(content);

            while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }

            stack[stack.length - 1].node.children.push(node);
            stack.push({ node, indent });
        } else if (stack.length > 1) {
            // It's a detail line for the current node
            const currentNode = stack[stack.length - 1].node;
            currentNode.details = currentNode.details || [];
            currentNode.details.push(cleanLine);

            // Check for hotspot triggers in details
            if (cleanLine.includes('Filter:') && currentNode.name.includes('Scan')) {
                // Heuristic: Scans with filters are often hotspots if rows are high
                if (currentNode.rows && parseInt(currentNode.rows) > 1000) {
                    currentNode.isHotspot = true;
                }
            }
        } else if (cleanLine) {
            // First line or un-indented line
            const node = parsePostgresLine(cleanLine);
            root.children.push(node);
            stack.push({ node, indent });
        }
    });

    return root.children[0] || null;
}

function parsePostgresLine(line: string): ExplainNode {
    const parts = line.split('(');
    const name = parts[0].trim();
    const metrics = parts[1] ? parts[1].replace(')', '') : '';

    const costMatch = metrics.match(/cost=([\d\.]+..[\d\.]+)/);
    const rowsMatch = metrics.match(/rows=(\d+)/);
    const widthMatch = metrics.match(/width=(\d+)/);

    const node: ExplainNode = {
        name,
        cost: costMatch ? costMatch[1] : undefined,
        rows: rowsMatch ? rowsMatch[1] : undefined,
        width: widthMatch ? widthMatch[1] : undefined,
        children: [],
        isHotspot: name.includes('Seq Scan') // Sequential scans are always suspects
    };

    return node;
}

function parseMysqlExplain(data: Record<string, unknown>[]): ExplainNode | null {
    if (!data || data.length === 0) return null;

    // MySQL EXPLAIN is often flat, we'll represent it as a sequence or simple hierarchy if we can infer it
    const nodes = data.map(row => {
        const name = `${row.select_type || 'SIMPLE'}: ${row.table || 'Derived'}`;
        const details: string[] = [];
        if (row.type) details.push(`Type: ${row.type}`);
        if (row.key) details.push(`Key: ${row.key}`);
        if (row.Extra) details.push(`Extra: ${row.Extra}`);

        return {
            name,
            rows: String(row.rows || ''),
            details,
            children: [],
            isHotspot: row.type === 'ALL' || String(row.Extra).includes('Using filesort') || String(row.Extra).includes('Using temporary')
        } as ExplainNode;
    });

    // Build a simple flat hierarchy for MySQL
    const root = nodes[0];
    let current = root;
    for (let i = 1; i < nodes.length; i++) {
        current.children.push(nodes[i]);
        current = nodes[i];
    }

    return root;
}
