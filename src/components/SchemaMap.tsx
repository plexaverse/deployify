'use client';

import React, { useMemo } from 'react';
import { Table } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Column {
    name: string;
    type: string;
    isPrimary?: boolean;
    isForeign?: boolean;
    referencesTable?: string;
    referencesColumn?: string;
    distribution?: { label: string, value: number }[];
}

interface SchemaMapProps {
    tables: string[];
    columns: Record<string, Column[]>;
    onTableClick: (tableName: string) => void;
}

export function SchemaMap({ tables, columns, onTableClick }: SchemaMapProps) {
    // Basic force-directed layout simulation (simplified for SVG)
    const tableNodes = useMemo(() => {
        const nodes: Record<string, { x: number, y: number, width: number, height: number }> = {};
        const spacing = 250;
        const cols = Math.ceil(Math.sqrt(tables.length));

        tables.forEach((table, i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const columnCount = columns[table]?.length || 0;
            nodes[table] = {
                x: 50 + col * spacing,
                y: 50 + row * (spacing + (columnCount * 15)),
                width: 180,
                height: 40 + columnCount * 20
            };
        });
        return nodes;
    }, [tables, columns]);

    const relationships = useMemo(() => {
        const lines: { x1: number, y1: number, x2: number, y2: number, from: string, to: string }[] = [];
        Object.entries(columns).forEach(([tableName, cols]) => {
            cols.forEach((col, colIdx) => {
                if (col.isForeign && col.referencesTable && tableNodes[col.referencesTable]) {
                    const fromNode = tableNodes[tableName];
                    const toNode = tableNodes[col.referencesTable];

                    // Calculate connection points
                    const fromY = fromNode.y + 45 + colIdx * 20;
                    lines.push({
                        x1: fromNode.x + fromNode.width,
                        y1: fromY,
                        x2: toNode.x,
                        y2: toNode.y + 20,
                        from: tableName,
                        to: col.referencesTable
                    });
                }
            });
        });
        return lines;
    }, [columns, tableNodes]);

    return (
        <div className="w-full overflow-auto bg-[var(--muted)]/5 rounded-xl border border-[var(--border)] p-4 min-h-[500px] custom-scrollbar">
            <svg
                width={Math.max(...Object.values(tableNodes).map(n => n.x + n.width + 50))}
                height={Math.max(...Object.values(tableNodes).map(n => n.y + n.height + 50))}
                className="mx-auto"
            >
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="var(--primary)" opacity="0.5" />
                    </marker>
                </defs>

                {/* Draw Relationship Lines */}
                {relationships.map((rel, i) => (
                    <path
                        key={i}
                        d={`M ${rel.x1} ${rel.y1} C ${rel.x1 + 40} ${rel.y1}, ${rel.x2 - 40} ${rel.y2}, ${rel.x2} ${rel.y2}`}
                        stroke="var(--primary)"
                        strokeWidth="1.5"
                        fill="none"
                        strokeOpacity="0.3"
                        markerEnd="url(#arrowhead)"
                    />
                ))}

                {/* Draw Tables */}
                {tables.map(table => {
                    const node = tableNodes[table];
                    return (
                        <g key={table} transform={`translate(${node.x}, ${node.y})`} className="cursor-pointer group" onClick={() => onTableClick(table)}>
                            <rect
                                width={node.width}
                                height={node.height}
                                rx="8"
                                fill="var(--background)"
                                stroke="var(--border)"
                                strokeWidth="1"
                                className="group-hover:stroke-[var(--primary)] transition-colors shadow-sm"
                            />
                            {/* Header */}
                            <rect
                                width={node.width}
                                height="30"
                                rx="8"
                                fill="var(--primary)"
                                fillOpacity="0.1"
                            />
                            <Table className="w-3 h-3 text-[var(--primary)] x-2 y-2" x="8" y="9" />
                            <text
                                x="25"
                                y="20"
                                className="text-[10px] font-bold uppercase tracking-wider fill-[var(--foreground)]"
                            >
                                {table.length > 20 ? table.substring(0, 17) + '...' : table}
                            </text>

                            {/* Columns */}
                            {columns[table]?.map((col, i) => (
                                <g key={col.name} transform={`translate(0, ${45 + i * 20})`}>
                                    <text
                                        x="10"
                                        y="0"
                                        className={cn(
                                            "text-[10px] font-mono",
                                            col.isPrimary ? "fill-[var(--primary)] font-bold" : "fill-[var(--muted-foreground)]"
                                        )}
                                    >
                                        {col.isPrimary && 'PK '}
                                        {col.isForeign && 'FK '}
                                        {col.name}
                                    </text>
                                    <text
                                        x={node.width - 10}
                                        y="0"
                                        textAnchor="end"
                                        className="text-[10px] fill-[var(--muted-foreground)] opacity-50 uppercase font-bold tracking-wider"
                                    >
                                        {col.type}
                                    </text>
                                </g>
                            ))}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
