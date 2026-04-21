'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Database, Play, Terminal, AlertCircle, Loader2, CheckCircle2, Table, Info, Search, Download, BarChart2, TrendingUp, History, Save, Trash2, Clock, RefreshCw, ChevronRight, X, AlertTriangle, FileCode, ChevronLeft, Copy, AlignLeft, PieChart as PieChartIcon, LayoutTemplate, Network, Link as LinkIcon, MessageSquare, Send, ShieldAlert, Eye, Activity, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import { SchemaMap } from '@/components/SchemaMap';
import { RedisTree } from '@/components/RedisTree';
import { VisualExplain } from '@/components/VisualExplain';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { QueryEditor } from '@/components/ui/query-editor';
import type { StorageConfig } from '@/types';

interface DataLabProps {
    projectId: string;
    connectors: StorageConfig[];
}

const ROWS_PER_PAGE = 10;
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

export function DataLab({ projectId, connectors }: DataLabProps) {
    const { projectStorageAuditLogs: auditLogs, fetchProjectStorageAuditLogs, userRole } = useStore();
    const currentUserId = connectors[0]?.metadata?.userId as string | undefined;
    const [selectedId, setSelectedId] = useState(connectors[0]?.id || '');
    const selectedConnector = connectors.find(c => c.id === selectedId);
    const [query, setQuery] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [isExplaining, setIsExplaining] = useState(false);
    const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
    const [resultSets, setResultSets] = useState<{ results: Record<string, unknown>[], rowCount: number }[] | null>(null);
    const [activeResultSet, setActiveResultSet] = useState(0);
    const [rowCount, setRowCount] = useState<number | null>(null);
    const [schemaView, setSchemaView] = useState<'list' | 'graph'>('list');
    const [executionTime, setExecutionTime] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'table' | 'json' | 'chart' | 'explain'>('table');
    const [chartConfig, setChartConfig] = useState<{ type: 'bar' | 'line' | 'area' | 'pie', xAxis: string, yAxis: string }>({ type: 'bar', xAxis: '', yAxis: '' });
    const [schema, setSchema] = useState<{
        tables?: string[],
        collections?: string[],
        tableStats?: Record<string, { estimatedRows: number }>,
        columns?: Record<string, {
            name: string,
            type: string,
            isPrimary?: boolean,
            isForeign?: boolean,
            referencesTable?: string,
            referencesColumn?: string,
            indices?: string[],
            distribution?: { label: string, value: number }[]
        }[]>
    } | null>(null);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [performanceData, setPerformanceData] = useState<{
        avgLatency: number,
        successRate: number,
        totalQueries?: number,
        timeseries?: { date: string, avgLatency: number }[],
        hotspots?: { query: string, avgLatency: number, count: number }[]
    } | null>(null);
    const [optimizationSuggestions, setOptimizationSuggestions] = useState<{ message: string, severity: 'high' | 'medium' | 'low', score: number }[] | null>(null);
    const [showInsights, setShowInsights] = useState(false);
    const [history, setHistory] = useState<{ id: string, query: string, timestamp: string, executionTimeMs?: number, rowCount?: number, error?: string }[]>([]);
    const [savedQueries, setSavedQueries] = useState<{ id: string, name: string, query: string, isPublic?: boolean, userId?: string }[]>([]);
    const [isSavingQuery, setIsSavingQuery] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [newQueryName, setNewQueryName] = useState('');
    const [isQueryPublic, setIsQueryPublic] = useState(false);
    const [isCloning, setIsCloning] = useState(false);
    const [selectedQueryComments, setSelectedQueryComments] = useState<string | null>(null);
    const [comments, setComments] = useState<Record<string, { id: string, text: string, userName: string, createdAt: string }[]>>({});
    const [newComment, setNewComment] = useState('');
    const [isPostingComment, setIsPostingComment] = useState(false);
    const [activeTab, setActiveTab] = useState<'editor' | 'history' | 'saved' | 'dashboards' | 'audit'>('editor');
    const [dashboards, setDashboards] = useState<{ id: string, name: string, query: string, chartConfig: { type: 'bar' | 'line' | 'area' | 'pie', xAxis: string, yAxis: string } | null, storageId: string, isPublic?: boolean, refreshInterval?: number }[]>([]);
    const [isSavingDashboard, setIsSavingDashboard] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [filterQuery, setFilterQuery] = useState('');
    const [entitySearchQuery, setEntitySearchQuery] = useState('');
    const [entityTypeFilter, setEntityTypeFilter] = useState<'all' | 'tables' | 'collections' | 'views'>('all');
    const [copiedCell, setCopiedCell] = useState<string | null>(null);
    const [copiedResults, setCopiedResults] = useState<'csv' | 'json' | 'code' | null>(null);
    const [isExportingPDF, setIsExportingPDF] = useState(false);
    const [queryVariables, setQueryVariables] = useState<Record<string, string>>({});
    const [detectedVars, setDetectedVars] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [showTemplates, setShowTemplates] = useState(false);
    const [schemaDocs, setSchemaDocs] = useState<{ id: string, entity: string, description: string, type: 'table' | 'column' }[]>([]);
    const [isSavingDoc, setIsSavingDoc] = useState<string | null>(null);
    const [viewingAuditQuery, setViewingAuditQuery] = useState<string | null>(null);

    useEffect(() => {
        // Detect :variable patterns
        const matches = query.match(/:[a-zA-Z0-9_]+/g);
        if (matches) {
            const uniqueVars = Array.from(new Set(matches.map(m => m.substring(1))));
            setDetectedVars(uniqueVars);

            // Initialize new variables in state if not present
            setQueryVariables(prev => {
                const next = { ...prev };
                let changed = false;
                uniqueVars.forEach(v => {
                    if (next[v] === undefined) {
                        next[v] = '';
                        changed = true;
                    }
                });
                return changed ? next : prev;
            });
        } else {
            setDetectedVars([]);
        }
    }, [query]);

    const fetchHistory = useCallback(async () => {
        if (!selectedId) return;
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/history`);
            const data = await response.json();
            if (data.success) {
                setHistory(data.history);
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
        }
    }, [projectId, selectedId]);

    const fetchSavedQueries = useCallback(async () => {
        if (!selectedId) return;
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/queries`);
            const data = await response.json();
            if (data.success) {
                setSavedQueries(data.queries);
            }
        } catch (error) {
            console.error('Failed to fetch saved queries:', error);
        }
    }, [projectId, selectedId]);

    const fetchMetrics = useCallback(async () => {
        if (!selectedId) return;
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/metrics`);
            const data = await response.json();
            if (data.success) {
                setPerformanceData(data.stats);
            }
        } catch (error) {
            console.error('Failed to fetch storage metrics:', error);
        }
    }, [projectId, selectedId]);

    const fetchDashboards = useCallback(async () => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/dashboards`);
            const data = await response.json();
            if (data.success) {
                setDashboards(data.widgets);
            }
        } catch (error) {
            console.error('Failed to fetch dashboards:', error);
        }
    }, [projectId]);

    const fetchSchemaDocs = useCallback(async () => {
        if (!selectedId) return;
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/schema-docs`);
            const data = await response.json();
            if (data.success) {
                setSchemaDocs(data.docs);
            }
        } catch (error) {
            console.error('Failed to fetch schema docs:', error);
        }
    }, [projectId, selectedId]);

    const fetchQueryInsights = useCallback(async () => {
        if (!selectedId || !selectedConnector?.type.includes('cloud-sql')) return;
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/query-insights`);
            const data = await response.json();
            if (data.success && data.insights.length > 0) {
                setPerformanceData(prev => prev ? {
                    ...prev,
                    hotspots: data.insights
                } : {
                    avgLatency: 0,
                    successRate: 100,
                    hotspots: data.insights
                });
            }
        } catch (error) {
            console.error('Failed to fetch query insights:', error);
        }
    }, [projectId, selectedId, selectedConnector]);

    useEffect(() => {
        fetchMetrics();
        fetchQueryInsights();
        fetchHistory();
        fetchSavedQueries();
        fetchDashboards();
        fetchSchemaDocs();
        if (activeTab === 'audit' && selectedId) {
            fetchProjectStorageAuditLogs(projectId, selectedId);
        }
    }, [fetchMetrics, fetchQueryInsights, fetchHistory, fetchSavedQueries, fetchDashboards, fetchSchemaDocs, activeTab, selectedId, projectId, fetchProjectStorageAuditLogs]);

    const saveSchemaDoc = async (entity: string, type: 'table' | 'column', description: string) => {
        setIsSavingDoc(`${type}_${entity}`);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/schema-docs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entity, type, description }),
            });
            if (response.ok) {
                fetchSchemaDocs();
            }
        } catch (error) {
            console.error('Failed to save schema doc:', error);
        } finally {
            setIsSavingDoc(null);
        }
    };

    const applyFilter = (col: string, val: unknown) => {
        if (!selectedConnector) return;
        const type = selectedConnector.type;

        if (type.includes('sql') || type === 'planetscale') {
            let newQuery = query.trim();
            const filterVal = val === null ? 'IS NULL' : (typeof val === 'string' ? `= '${val}'` : `= ${val}`);
            const filterClause = `${col} ${filterVal}`;

            // Handle SQL syntax priority (WHERE must come before GROUP BY, ORDER BY, LIMIT)
            const upperQuery = newQuery.toUpperCase();
            const clauses = ['GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT'];
            let insertionPoint = newQuery.length;

            for (const clause of clauses) {
                const idx = upperQuery.indexOf(clause);
                if (idx !== -1 && idx < insertionPoint) {
                    insertionPoint = idx;
                }
            }

            if (!upperQuery.includes('WHERE')) {
                const before = newQuery.substring(0, insertionPoint).trim();
                const after = newQuery.substring(insertionPoint).trim();
                newQuery = `${before} WHERE ${filterClause}${after ? ' ' + after : ''}`;
            } else if (!upperQuery.includes(`${col.toUpperCase()} ${filterVal.toUpperCase()}`)) {
                const before = newQuery.substring(0, insertionPoint).trim();
                const after = newQuery.substring(insertionPoint).trim();
                newQuery = `${before} AND ${filterClause}${after ? ' ' + after : ''}`;
            }

            setQuery(newQuery);
            executeQuery(newQuery);
        } else {
            // NoSQL (JSON) mutation
            try {
                const qObj = JSON.parse(query);
                if (type === 'mongodb-atlas' || type === 'firestore') {
                    qObj.filter = qObj.filter || {};
                    qObj.filter[col] = val;
                }
                const newQ = JSON.stringify(qObj, null, 4);
                setQuery(newQ);
                executeQuery(newQ);
            } catch (e) {
                console.error('Failed to apply NoSQL filter:', e);
            }
        }
    };

    const executeQuery = async (overrideQuery?: string, explain = false) => {
        let queryToRun = overrideQuery || query;
        if (!selectedId || !queryToRun.trim()) return;

        if (explain) {
            queryToRun = `EXPLAIN ${queryToRun}`;
            setIsExplaining(true);
        } else {
            setIsExecuting(true);
        }

        if (!overrideQuery) setError(null);
        if (!overrideQuery) {
            setResults(null);
            setRowCount(null);
            setExecutionTime(null);
        }
        setCurrentPage(1);

        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: queryToRun, variables: queryVariables }),
            });

            const data = await response.json();
            if (data.success) {
                if (queryToRun === 'DISCOVER_SCHEMA') {
                    const schemaData = data.schema;
                    const samples = data.samples || [];

                    // Enhance with distributions for numeric columns if sample results exist
                    if (schemaData.columns && samples.length > 0) {
                        Object.keys(schemaData.columns).forEach(table => {
                            schemaData.columns[table] = schemaData.columns[table].map((col: { name: string, type: string, isPrimary?: boolean, isForeign?: boolean, distribution?: { label: string, value: number }[] }) => {
                                const isNumeric = col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('float') || col.type.toLowerCase().includes('number') || col.type.toLowerCase().includes('decimal');
                                if (isNumeric) {
                                    const values = samples
                                        .filter((s: Record<string, unknown>) => s._table === table || !('_table' in s) || !s._table)
                                        .map((s: Record<string, unknown>) => s[col.name])
                                        .filter((v: unknown) => typeof v === 'number');

                                    if (values.length > 0) {
                                        // Simple frequency map for distribution
                                        const freq: Record<string, number> = {};
                                        values.forEach((v: unknown) => {
                                            const key = String(v);
                                            freq[key] = (freq[key] || 0) + 1;
                                        });
                                        col.distribution = Object.entries(freq)
                                            .map(([label, value]) => ({ label, value }))
                                            .slice(0, 10); // Limit to 10 points
                                    }
                                }
                                return col;
                            });
                        });
                    }
                    setSchema(schemaData);
                } else {
                    if (data.resultSets) {
                        setResultSets(data.resultSets);
                        setResults(data.resultSets[0].results);
                        setRowCount(data.resultSets[0].rowCount);
                        setActiveResultSet(0);
                    } else {
                        setResultSets(null);
                        setResults(data.results);
                        setRowCount(data.rowCount);
                    }

                    if (queryToRun.toUpperCase().startsWith('EXPLAIN')) {
                        setViewMode('explain');
                    }

                    setOptimizationSuggestions(data.optimizationSuggestions || null);
                    setExecutionTime(data.executionTimeMs);
                    // Re-fetch historical metrics and history after execution
                    if (!explain) {
                        fetchMetrics();
                        fetchHistory();
                    }
                }
            } else {
                setError(data.error || 'Failed to execute query');
            }
        } catch {
            setError('Network error: Failed to connect to proxy');
        } finally {
            setIsExecuting(false);
            setIsExplaining(false);
        }
    };

    const discoverSchema = async () => {
        setIsDiscovering(true);
        await executeQuery('DISCOVER_SCHEMA');
        setIsDiscovering(false);
    };

    const saveQuery = async () => {
        if (!newQueryName.trim() || !query.trim()) return;
        setIsSavingQuery(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/queries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newQueryName, query, isPublic: isQueryPublic }),
            });
            const data = await response.json();
            if (data.success) {
                setShowSaveModal(false);
                setNewQueryName('');
                setIsQueryPublic(false);
                fetchSavedQueries();
            }
        } catch (error) {
            console.error('Failed to save query:', error);
        } finally {
            setIsSavingQuery(false);
        }
    };

    const deleteSavedQuery = async (queryId: string) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/queries/${queryId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                fetchSavedQueries();
            }
        } catch (error) {
            console.error('Failed to delete saved query:', error);
        }
    };

    const fetchComments = async (queryId: string) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/queries/${queryId}/comments`);
            const data = await response.json();
            if (data.success) {
                setComments(prev => ({ ...prev, [queryId]: data.comments }));
            }
        } catch (error) {
            console.error('Failed to fetch comments:', error);
        }
    };

    const postComment = async (queryId: string) => {
        if (!newComment.trim()) return;
        setIsPostingComment(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/queries/${queryId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: newComment }),
            });
            const data = await response.json();
            if (data.success) {
                setNewComment('');
                fetchComments(queryId);
            }
        } catch (error) {
            console.error('Failed to post comment:', error);
        } finally {
            setIsPostingComment(false);
        }
    };

    const getCSVContent = (data: Record<string, unknown>[]) => {
        if (data.length === 0) return '';
        const columns = Object.keys(data[0]);
        const header = columns.join(',');
        const rows = data.map(row =>
            columns.map(col => {
                const val = row[col];
                const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                return `"${stringVal.replace(/"/g, '""')}"`;
            }).join(',')
        );
        return [header, ...rows].join('\n');
    };

    const downloadCSV = () => {
        if (!results || results.length === 0) return;
        const csvContent = getCSVContent(results);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `datalab-export-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const copyResultsCSV = () => {
        if (!processedResults || processedResults.length === 0) return;
        const csvContent = getCSVContent(processedResults);
        navigator.clipboard.writeText(csvContent);
        setCopiedResults('csv');
        setTimeout(() => setCopiedResults(null), 2000);
    };

    const copyResultsJSON = () => {
        if (!processedResults || processedResults.length === 0) return;
        const jsonContent = JSON.stringify(processedResults, null, 2);
        navigator.clipboard.writeText(jsonContent);
        setCopiedResults('json');
        setTimeout(() => setCopiedResults(null), 2000);
    };

    const copyAsCode = () => {
        if (!query || !selectedConnector) return;

        let code = '';
        const type = selectedConnector.type;

        if (type === 'cloud-sql-postgres' || type === 'supabase') {
            code = `import { Client } from 'pg';

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runQuery() {
    await client.connect();
    const res = await client.query(\`${query.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`, [${detectedVars.map(v => `process.env.${v.toUpperCase()}`).join(', ')}]);
    console.log(res.rows);
    await client.end();
}

runQuery();`;
        } else if (type === 'cloud-sql-mysql' || type === 'planetscale') {
            code = `import mysql from 'mysql2/promise';

async function runQuery() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    const [rows] = await connection.execute(\`${query.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`, [${detectedVars.map(v => `process.env.${v.toUpperCase()}`).join(', ')}]);
    console.log(rows);
    await connection.end();
}

runQuery();`;
        } else if (type === 'mongodb-atlas') {
            code = `import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);

async function runQuery() {
    await client.connect();
    const db = client.db();
    const query = ${query};
    const results = await db.collection(query.collection).find(query.filter || {}).limit(query.limit || 10).toArray();
    console.log(results);
    await client.close();
}

runQuery();`;
        } else if (type === 'memorystore-redis') {
            code = `import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function runQuery() {
    const result = await redis.call('get', 'key'); // Example for basic GET
    console.log(result);
    redis.disconnect();
}

runQuery();`;
        } else {
            code = `// Connector type ${type} code snippet not available.
// Query: ${query}`;
        }

        navigator.clipboard.writeText(code);
        setCopiedResults('code');
        setTimeout(() => setCopiedResults(null), 2000);
    };

    const downloadJSON = () => {
        if (!results || results.length === 0) return;

        const jsonContent = JSON.stringify(results, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `datalab-export-${new Date().toISOString().split('T')[0]}.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadPDF = async () => {
        if (!processedResults || processedResults.length === 0 || !selectedConnector) return;
        setIsExportingPDF(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${selectedId}/export/pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    results: processedResults,
                    query: query || 'N/A',
                    storageName: selectedConnector.name,
                    storageType: selectedConnector.type
                }),
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `datalab-report-${projectId}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                console.error('Failed to export PDF');
            }
        } catch (error) {
            console.error('Error exporting PDF:', error);
        } finally {
            setIsExportingPDF(false);
        }
    };

    const exportDataDictionary = () => {
        if (!schema || !schema.columns || !selectedConnector) return;

        let md = `# Data Dictionary: ${selectedConnector.name}\n`;
        md += `**Provider:** ${selectedConnector.type.toUpperCase()}\n`;
        md += `**Generated:** ${new Date().toLocaleString()}\n\n`;

        Object.entries(schema.columns).forEach(([table, cols]) => {
            const tableDesc = schemaDocs.find(d => d.entity === table && d.type === 'table')?.description;
            md += `## Table: ${table}\n`;
            if (tableDesc) md += `*${tableDesc}*\n\n`;

            md += `| Column | Type | Keys | Description |\n`;
            md += `|--------|------|------|-------------|\n`;

            cols.forEach(col => {
                const colDesc = schemaDocs.find(d => d.entity === `${table}.${col.name}` && d.type === 'column')?.description;
                const keys = [
                    col.isPrimary ? 'PK' : '',
                    col.isForeign ? `FK (${col.referencesTable})` : '',
                    col.indices?.length ? 'IDX' : ''
                ].filter(Boolean).join(', ');

                md += `| ${col.name} | ${col.type} | ${keys || '-'} | ${colDesc || '-'} |\n`;
            });
            md += `\n`;
        });

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `data-dictionary-${selectedConnector.name.toLowerCase().replace(/\s+/g, '-')}.md`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Data Dictionary exported');
    };

    const exportTypeScript = () => {
        if (!schema || !schema.columns) return;

        let tsContent = '// Generated by Deployify Data Lab\n\n';

        Object.entries(schema.columns).forEach(([table, cols]) => {
            const interfaceName = table.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('') + 'Row';
            tsContent += `export interface ${interfaceName} {\n`;
            cols.forEach(col => {
                let tsType = 'any';
                const lowerType = col.type.toLowerCase();
                if (lowerType.includes('int') || lowerType.includes('float') || lowerType.includes('decimal') || lowerType.includes('numeric') || lowerType === 'number') {
                    tsType = 'number';
                } else if (lowerType.includes('char') || lowerType.includes('text') || lowerType.includes('string')) {
                    tsType = 'string';
                } else if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp')) {
                    tsType = 'Date | string';
                } else if (lowerType.includes('bool')) {
                    tsType = 'boolean';
                } else if (lowerType === 'object') {
                    tsType = 'Record<string, unknown>';
                }
                tsContent += `    ${col.name}: ${tsType};\n`;
            });
            tsContent += '}\n\n';
        });

        const blob = new Blob([tsContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `database-types-${new Date().toISOString().split('T')[0]}.ts`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const cloneQuery = (q: typeof savedQueries[0]) => {
        setQuery(q.query);
        setNewQueryName(`COPY OF ${q.name.toUpperCase()}`);
        setIsQueryPublic(!!q.isPublic);
        setIsCloning(true);
        setShowSaveModal(true);
    };

    const clearResults = () => {
        setResults(null);
        setResultSets(null);
        setActiveResultSet(0);
        setRowCount(null);
        setExecutionTime(null);
        setError(null);
        setOptimizationSuggestions(null);
        setFilterQuery('');
        setCurrentPage(1);
        setSortConfig(null);
    };

    const formatQuery = () => {
        if (!query.trim()) return;
        try {
            if (query.trim().startsWith('{')) {
                // JSON Formatting
                setQuery(JSON.stringify(JSON.parse(query), null, 4));
            } else {
                // Enhanced SQL Formatting (Safely handling string literals)
                const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIMIT', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'ON', 'INSERT', 'UPDATE', 'DELETE', 'VALUES', 'SET', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INTO', 'DESC', 'ASC', 'UNION', 'ALL', 'EXPLAIN', 'ANALYZE', 'WITH'];

                // 1. Extract and preserve string literals
                const literals: string[] = [];
                let formatted = query.replace(/'[^']*'/g, (match) => {
                    literals.push(match);
                    return `__LITERAL_${literals.length - 1}__`;
                });

                // 2. Collapse whitespace and uppercase keywords
                formatted = formatted.trim().replace(/\s+/g, ' ');
                keywords.forEach(kw => {
                    const regex = new RegExp(`\\b${kw}\\b`, 'gi');
                    formatted = formatted.replace(regex, kw.toUpperCase());
                });

                // 3. Professional Multi-line Formatting with Indentation
                const majorKeywords = ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'LIMIT', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'UNION', 'WITH', 'VALUES', 'SET'];
                majorKeywords.forEach(kw => {
                    const regex = new RegExp(`\\s*\\b${kw}\\b`, 'g');
                    formatted = formatted.replace(regex, `\n${kw}`);
                });

                const subKeywords = ['AND', 'OR', 'ON'];
                subKeywords.forEach(kw => {
                    const regex = new RegExp(`\\s*\\b${kw}\\b`, 'g');
                    formatted = formatted.replace(regex, `\n    ${kw}`);
                });

                if (formatted.startsWith('SELECT')) {
                    formatted = formatted.replace(/SELECT\s+([\s\S]+?)\s+FROM/, (_match, items) => {
                        // Improved splitting logic that respects parentheses to avoid breaking functions (COALESCE, CONCAT, etc.)
                        const parts: string[] = [];
                        let current = '';
                        let depth = 0;
                        for (let i = 0; i < items.length; i++) {
                            const char = items[i];
                            if (char === '(') depth++;
                            if (char === ')') depth--;
                            if (char === ',' && depth === 0) {
                                parts.push(current.trim());
                                current = '';
                            } else {
                                current += char;
                            }
                        }
                        parts.push(current.trim());

                        const indentedItems = parts.map(s => `    ${s}`).join(',\n');
                        return `SELECT\n${indentedItems}\nFROM`;
                    });
                }

                // 4. Restore preserved literals
                literals.forEach((lit, i) => {
                    formatted = formatted.replace(`__LITERAL_${i}__`, lit);
                });

                setQuery(formatted.trim());
            }
        } catch (e) {
            console.error('Failed to format query:', e);
        }
    };

    const toggleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                if (prev.direction === 'asc') return { key, direction: 'desc' };
                return null;
            }
            return { key, direction: 'asc' };
        });
    };

    const addToDashboard = async (name: string) => {
        if (!selectedId || !query) return;
        setIsSavingDashboard(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/dashboards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    query,
                    chartConfig: viewMode === 'chart' ? chartConfig : null,
                    storageId: selectedId,
                    isPublic: false,
                    refreshInterval: 0
                }),
            });
            const data = await response.json();
            if (data.success) {
                fetchDashboards();
            }
        } catch (error) {
            console.error('Failed to add to dashboard:', error);
        } finally {
            setIsSavingDashboard(false);
        }
    };

    const updateDashboardWidget = async (widgetId: string, updates: Record<string, unknown>) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/dashboards/${widgetId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (response.ok) {
                fetchDashboards();
            }
        } catch (error) {
            console.error('Failed to update dashboard widget:', error);
        }
    };

    const deleteDashboardWidget = async (widgetId: string) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/dashboards/${widgetId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                fetchDashboards();
            }
        } catch (error) {
            console.error('Failed to delete dashboard widget:', error);
        }
    };

    const editorSuggestions = useMemo(() => {
        if (!schema) return [];
        const tables = schema.tables || schema.collections || [];
        const columns = schema.columns ? Object.values(schema.columns).flat().map(c => c.name) : [];
        const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIMIT', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'ON', 'INSERT', 'UPDATE', 'DELETE', 'VALUES', 'SET', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INTO', 'DESC', 'ASC', 'UNION', 'ALL', 'EXPLAIN', 'ANALYZE', 'WITH'];

        // Add JOIN suggestions based on relationships
        const joinSuggestions: string[] = [];
        if (schema.columns) {
            Object.entries(schema.columns).forEach(([table, cols]) => {
                cols.forEach(col => {
                    if (col.isForeign && col.referencesTable) {
                        joinSuggestions.push(`JOIN ${col.referencesTable} ON ${table}.${col.name} = ${col.referencesTable}.${col.referencesColumn}`);
                    }
                });
            });
        }

        return Array.from(new Set([...tables, ...columns, ...sqlKeywords, ...joinSuggestions]));
    }, [schema]);

    const templates = useMemo(() => {
        const type = selectedConnector?.type || 'generic';
        if (type.includes('sql') || type === 'planetscale') {
            return [
                { name: 'SELECT ALL', query: 'SELECT * FROM table_name LIMIT 10' },
                { name: 'WHERE FILTER', query: 'SELECT * FROM table_name WHERE column = :value' },
                { name: 'ORDER BY', query: 'SELECT * FROM table_name ORDER BY created_at DESC LIMIT 10' },
                { name: 'GROUP BY', query: 'SELECT column, COUNT(*) FROM table_name GROUP BY column' },
                { name: 'JOIN TABLES', query: 'SELECT t1.*, t2.* FROM table1 t1 JOIN table2 t2 ON t1.id = t2.t1_id LIMIT 10' },
                { name: 'EXPLAIN ANALYZE', query: 'EXPLAIN ANALYZE SELECT * FROM table_name' }
            ];
        }
        if (type === 'mongodb-atlas') {
            return [
                { name: 'FIND ALL', query: '{ "collection": "users", "limit": 10 }' },
                { name: 'FILTER BY FIELD', query: '{ "collection": "users", "filter": { "email": ":email" } }' },
                { name: 'SORT RESULTS', query: '{ "collection": "users", "sort": { "createdAt": -1 }, "limit": 10 }' },
                { name: 'AGGREGATE', query: '{ "collection": "users", "aggregate": [{ "$group": { "_id": "$status", "count": { "$sum": 1 } } }] }' }
            ];
        }
        if (type === 'firestore') {
            return [
                { name: 'COLLECTION GET', query: '{ "collection": "users", "limit": 10 }' },
                { name: 'WHERE CLAUSE', query: '{ "collection": "users", "where": [["status", "==", "active"]] }' }
            ];
        }
        if (type === 'memorystore-redis') {
            return [
                { name: 'GET KEY', query: 'GET :key' },
                { name: 'HGETALL', query: '{ "command": "hgetall", "args": [":key"] }' },
                { name: 'SCAN KEYS', query: 'SCAN 0 COUNT 20' },
                { name: 'EXPIRE', query: 'EXPIRE :key 3600' }
            ];
        }
        return [];
    }, [selectedConnector]);

    const processedResults = useMemo(() => {
        if (!results) return null;

        // 1. Filter
        let data = [...results];
        if (filterQuery.trim()) {
            const lowQuery = filterQuery.toLowerCase();
            data = data.filter(row =>
                Object.values(row).some(val =>
                    String(val).toLowerCase().includes(lowQuery)
                )
            );
        }

        // 2. Sort
        if (sortConfig) {
            data.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];

                if (aVal === bVal) return 0;
                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;

                const comparison = aVal < bVal ? -1 : 1;
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }

        return data;
    }, [results, filterQuery, sortConfig]);

    const paginatedResults = useMemo(() => {
        if (!processedResults) return null;
        const start = (currentPage - 1) * ROWS_PER_PAGE;
        const end = start + ROWS_PER_PAGE;
        return processedResults.slice(start, end);
    }, [processedResults, currentPage]);

    const totalPages = processedResults ? Math.ceil(processedResults.length / ROWS_PER_PAGE) : 0;

    const renderResultsTable = () => {
        if (!paginatedResults || paginatedResults.length === 0 || !processedResults) return null;
        const columns = Object.keys(paginatedResults[0]);

        // Enhanced Visual EXPLAIN Rendering
        const isExplainResults = query.toUpperCase().startsWith('EXPLAIN');

        // Calculate aggregations for numeric columns
        const aggregations: Record<string, { sum: number, avg: number, min: number, max: number, count: number }> = {};
        columns.forEach(col => {
            const values = processedResults
                .map(row => row[col])
                .filter(val => typeof val === 'number') as number[];

            if (values.length > 0) {
                const sum = values.reduce((a, b) => a + b, 0);
                aggregations[col] = {
                    sum,
                    avg: sum / values.length,
                    min: Math.min(...values),
                    max: Math.max(...values),
                    count: values.length
                };
            }
        });

        return (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--background)]">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[var(--muted)]/20 border-b border-[var(--border)]">
                            {columns.map(col => (
                                <th
                                    key={col}
                                    onClick={() => toggleSort(col)}
                                    className="p-3 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] whitespace-nowrap cursor-pointer hover:text-[var(--primary)] transition-colors group"
                                >
                                    <div className="flex items-center gap-1.5">
                                        {col}
                                        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                            <TrendingUp className={cn(
                                                "w-2.5 h-2.5",
                                                sortConfig?.key === col && sortConfig.direction === 'asc' ? "text-[var(--primary)] opacity-100" : "opacity-30"
                                            )} />
                                            <TrendingUp className={cn(
                                                "w-2.5 h-2.5 rotate-180",
                                                sortConfig?.key === col && sortConfig.direction === 'desc' ? "text-[var(--primary)] opacity-100" : "opacity-30"
                                            )} />
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedResults.map((row, i) => (
                            <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/5 transition-colors group/row">
                                {columns.map(col => {
                                    const value = typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col]);
                                    // Try to find FK metadata for this column
                                    const fkInfo = schema?.columns ? Object.values(schema.columns).flat().find(c => c.name === col && c.isForeign && c.referencesTable) : null;

                                    return (
                                        <td key={col} className="p-3 text-[8px] font-mono whitespace-nowrap max-w-[200px] truncate group/cell relative">
                                            <div className="flex items-center gap-1.5">
                                                {isExplainResults && col === 'QUERY PLAN' ? (
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            {value.includes('Seq Scan') && <span className="text-[7px] px-1 rounded bg-[var(--error)]/20 text-[var(--error)] font-bold">FULL SCAN</span>}
                                                            {value.includes('Index Scan') && <span className="text-[7px] px-1 rounded bg-[var(--success)]/20 text-[var(--success)] font-bold">INDEX</span>}
                                                            {value.includes('Bitmap Index Scan') && <span className="text-[7px] px-1 rounded bg-[var(--success)]/10 text-[var(--success)] font-bold">BITMAP</span>}
                                                            {value.includes('Hash Join') && <span className="text-[7px] px-1 rounded bg-[var(--primary)]/10 text-[var(--primary)] font-bold">HASH JOIN</span>}
                                                            {value.includes('Nested Loop') && <span className="text-[7px] px-1 rounded bg-[var(--warning)]/10 text-[var(--warning)] font-bold">LOOP</span>}
                                                            <span>{value}</span>
                                                        </div>
                                                    </div>
                                                ) : isExplainResults && col === 'type' && value === 'ALL' ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[7px] px-1 rounded bg-[var(--error)]/20 text-[var(--error)] font-bold uppercase">Critical</span>
                                                        {value}
                                                    </div>
                                                ) : (
                                                    value
                                                )}
                                                {fkInfo && (
                                                    <button
                                                        onClick={() => {
                                                            const q = selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale'
                                                                ? `SELECT * FROM ${fkInfo.referencesTable} WHERE ${fkInfo.referencesColumn} = ${typeof row[col] === 'string' ? `'${row[col]}'` : row[col]} LIMIT 1`
                                                                : `{ "collection": "${fkInfo.referencesTable}", "filter": { "${fkInfo.referencesColumn}": ${JSON.stringify(row[col])} }, "limit": 1 }`;
                                                            setQuery(q);
                                                            executeQuery(q);
                                                        }}
                                                        className="p-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors"
                                                        title={`Fetch related from ${fkInfo.referencesTable}`}
                                                    >
                                                        <LinkIcon className="w-2.5 h-2.5" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => applyFilter(col, row[col])}
                                                    className="p-1 rounded bg-[var(--background)] border border-[var(--border)] hover:text-[var(--primary)]"
                                                    title="Filter by this value"
                                                >
                                                    <Search className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(value);
                                                        setCopiedCell(`${i}-${col}`);
                                                        setTimeout(() => setCopiedCell(null), 2000);
                                                    }}
                                                    className="p-1 rounded bg-[var(--background)] border border-[var(--border)] hover:text-[var(--primary)]"
                                                    title="Copy cell value"
                                                >
                                                    {copiedCell === `${i}-${col}` ? (
                                                        <CheckCircle2 className="w-3 h-3 text-[var(--success)]" />
                                                    ) : (
                                                        <Copy className="w-3 h-3" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                    {Object.keys(aggregations).length > 0 && (
                        <tfoot className="bg-[var(--primary)]/5 border-t border-[var(--border)]">
                            <tr>
                                {columns.map(col => (
                                    <td key={col} className="p-3">
                                        {aggregations[col] ? (
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="text-[8px] font-bold text-[var(--muted-foreground)] uppercase">SUM</span>
                                                    <span className="text-[8px] font-mono font-bold text-[var(--primary)]">{aggregations[col].sum.toLocaleString()}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="text-[8px] font-bold text-[var(--muted-foreground)] uppercase">AVG</span>
                                                    <span className="text-[8px] font-mono font-bold text-[var(--primary)]">{aggregations[col].avg.toFixed(2)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="text-[8px] font-bold text-[var(--muted-foreground)] uppercase">MIN/MAX</span>
                                                    <span className="text-[8px] font-mono font-bold text-[var(--primary)]">{aggregations[col].min} / {aggregations[col].max}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-4" />
                                        )}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        );
    };

    const renderChart = () => {
        if (!processedResults || processedResults.length === 0) return null;

        const columns = Object.keys(processedResults[0]);
        const numericColumns = columns.filter(col =>
            processedResults.some(row => typeof row[col] === 'number')
        );

        const ChartComponent = chartConfig.type === 'bar' ? BarChart : chartConfig.type === 'line' ? LineChart : AreaChart;
        const DataComponent = (chartConfig.type === 'bar' ? Bar : chartConfig.type === 'line' ? Line : Area) as unknown as React.ElementType;

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">X-Axis (Labels)</Label>
                        <select
                            value={chartConfig.xAxis}
                            onChange={(e) => setChartConfig(prev => ({ ...prev, xAxis: e.target.value }))}
                            className="w-full h-8 px-2 rounded bg-[var(--muted)]/20 border border-[var(--border)] text-[8px] font-bold uppercase"
                        >
                            <option value="">SELECT X-AXIS</option>
                            {columns.map(col => <option key={col} value={col}>{col.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Y-Axis (Numeric)</Label>
                        <select
                            value={chartConfig.yAxis}
                            onChange={(e) => setChartConfig(prev => ({ ...prev, yAxis: e.target.value }))}
                            className="w-full h-8 px-2 rounded bg-[var(--muted)]/20 border border-[var(--border)] text-[8px] font-bold uppercase"
                        >
                            <option value="">SELECT Y-AXIS</option>
                            {numericColumns.map(col => <option key={col} value={col}>{col.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Chart Type</Label>
                        <div className="flex gap-1 bg-[var(--muted)]/20 p-1 rounded-xl border border-[var(--border)] h-8">
                            {(['bar', 'line', 'area', 'pie'] as const).map(t => (
                                <Button
                                    key={t}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setChartConfig(prev => ({ ...prev, type: t }))}
                                        className={`flex-1 h-full text-[8px] font-bold uppercase tracking-wider px-1 ${chartConfig.type === t ? 'bg-[var(--background)] shadow-sm text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}
                                >
                                    {t}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>

                {!chartConfig.xAxis || !chartConfig.yAxis ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4 border border-dashed border-[var(--border)] rounded-2xl bg-[var(--muted)]/5">
                        <PieChartIcon className="w-8 h-8 text-[var(--muted-foreground)]/30" />
                        <div className="text-center space-y-1">
                            <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Configure axes to visualize data</p>
                            <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">Select X and Y axes from the results</p>
                        </div>
                    </div>
                ) : (
                <div className="h-[400px] w-full bg-[var(--background)] rounded-xl border border-[var(--border)] p-6">
                    <ResponsiveContainer width="100%" height="100%">
                        {chartConfig.type === 'pie' ? (
                            <PieChart>
                                <Pie
                                    data={processedResults}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={140}
                                    fill="var(--primary)"
                                    dataKey={chartConfig.yAxis}
                                    nameKey={chartConfig.xAxis}
                                    label={({ name, percent }) => `${String(name).toUpperCase()} ${((percent || 0) * 100).toFixed(0)}%`}
                                >
                                    {processedResults.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'var(--popover)',
                                        borderColor: 'var(--border)',
                                        borderRadius: '8px',
                                        fontSize: '10px',
                                        fontWeight: 'bold',
                                        textTransform: 'uppercase'
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px' }} />
                            </PieChart>
                        ) : (
                        <ChartComponent data={processedResults}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} vertical={false} />
                            <XAxis
                                dataKey={chartConfig.xAxis}
                                stroke="var(--muted-foreground)"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => String(val).toUpperCase()}
                            />
                            <YAxis
                                stroke="var(--muted-foreground)"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--popover)',
                                    borderColor: 'var(--border)',
                                    borderRadius: '8px',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase'
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px' }} />
                            <DataComponent
                                type="monotone"
                                dataKey={chartConfig.yAxis}
                                fill="var(--primary)"
                                stroke="var(--primary)"
                                fillOpacity={0.3}
                                strokeWidth={2}
                                radius={[4, 4, 0, 0]}
                            />
                        </ChartComponent>
                        )}
                    </ResponsiveContainer>
                </div>
                )}
            </div>
        );
    };

    return (
        <Card className="overflow-hidden p-0 border-[var(--primary)]/20 shadow-xl shadow-[var(--primary)]/5">
            <div className="p-6 flex items-center justify-between bg-[var(--primary)]/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center shrink-0">
                        <Terminal className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Data Lab</span>
                        <h3 className="text-[10px] font-bold">Managed Query Browser</h3>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    {performanceData && (
                        <>
                            <div className="text-right hidden md:block">
                                <span className="block text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Avg Latency</span>
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">{performanceData.avgLatency}ms</span>
                            </div>
                            <div className="text-right hidden md:block">
                                <span className="block text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Success Rate</span>
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--success)]">{performanceData.successRate}%</span>
                            </div>
                        </>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowInsights(!showInsights)}
                        className={`h-8 px-3 text-[8px] font-bold uppercase tracking-wider ${showInsights ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}
                    >
                        <BarChart2 className="w-4 h-4 mr-2" />
                        Performance Insights
                    </Button>
                </div>
            </div>

            <Separator className="bg-[var(--border)]" />

            <div className="px-6 py-2 bg-[var(--muted)]/5 border-b border-[var(--border)] flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('editor')}
                    className={`h-8 px-3 text-[8px] font-bold uppercase tracking-wider rounded-none border-b-2 transition-all ${activeTab === 'editor' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-[var(--muted-foreground)]'}`}
                >
                    <Terminal className="w-3.5 h-3.5 mr-2" />
                    Query Editor
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('saved')}
                    className={`h-8 px-3 text-[8px] font-bold uppercase tracking-wider rounded-none border-b-2 transition-all ${activeTab === 'saved' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-[var(--muted-foreground)]'}`}
                >
                    <Save className="w-3.5 h-3.5 mr-2" />
                    Saved Queries
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('history')}
                    className={`h-8 px-3 text-[8px] font-bold uppercase tracking-wider rounded-none border-b-2 transition-all ${activeTab === 'history' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-[var(--muted-foreground)]'}`}
                >
                    <History className="w-3.5 h-3.5 mr-2" />
                    Query History
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('dashboards')}
                    className={`h-8 px-3 text-[8px] font-bold uppercase tracking-wider rounded-none border-b-2 transition-all ${activeTab === 'dashboards' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-[var(--muted-foreground)]'}`}
                >
                    <BarChart2 className="w-3.5 h-3.5 mr-2" />
                    Dashboards
                </Button>
                {userRole !== 'viewer' && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab('audit')}
                        className={`h-8 px-3 text-[8px] font-bold uppercase tracking-wider rounded-none border-b-2 transition-all ${activeTab === 'audit' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-[var(--muted-foreground)]'}`}
                    >
                        <ShieldAlert className="w-3.5 h-3.5 mr-2" />
                        Compliance Audit
                    </Button>
                )}
            </div>

            <div className="p-6 space-y-6">
                {activeTab === 'audit' ? (
                    <div className="space-y-4 animate-fade-in">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                    <ShieldAlert className="w-5 h-5 text-[var(--primary)]" />
                                </div>
                                <div>
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Compliance Monitoring</span>
                                    <h3 className="text-[10px] font-bold">Query Audit Logs</h3>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => fetchProjectStorageAuditLogs(projectId, selectedId)}
                                className="h-8 px-3 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)] hover:bg-[var(--primary)]/10"
                            >
                                <RefreshCw className="w-3.5 h-3.5 mr-2" />
                                Refresh Logs
                            </Button>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--background)]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-[var(--muted)]/20 border-b border-[var(--border)]">
                                        <th className="p-3 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Timestamp</th>
                                        <th className="p-3 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">User</th>
                                        <th className="p-3 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Query</th>
                                        <th className="p-3 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Status</th>
                                        <th className="p-3 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center">
                                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">No audit logs found</span>
                                            </td>
                                        </tr>
                                    ) : (
                                        auditLogs.map((log) => (
                                            <tr key={log.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/5 transition-colors">
                                                <td className="p-3 text-[8px] font-mono whitespace-nowrap">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </td>
                                                <td className="p-3 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">
                                                    {log.userEmail}
                                                </td>
                                                <td className="p-3 text-[8px] font-mono max-w-[300px] truncate">
                                                    {log.query}
                                                </td>
                                                <td className="p-3">
                                                    <span className={cn(
                                                        "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                                                        log.success ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--error)]/10 text-[var(--error)]"
                                                    )}>
                                                        {log.success ? 'SUCCESS' : 'FAILED'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setViewingAuditQuery(log.query)}
                                                        className="h-7 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                                    >
                                                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                                                        View Query
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : activeTab === 'editor' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Select Connector</Label>
                        <select
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                                    className="w-full h-10 px-3 rounded-lg bg-[var(--muted)]/20 border border-[var(--border)] text-[8px] font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50"
                        >
                            {connectors.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.type.toUpperCase()})</option>
                            ))}
                        </select>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                {selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale' ? 'SQL Query (Read-Only)' : 'NoSQL Filter / JSON'}
                            </Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]"
                                onClick={discoverSchema}
                                disabled={isDiscovering}
                            >
                                {isDiscovering ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Search className="w-3 h-3 mr-1.5" />}
                                Discover Schema
                            </Button>
                        </div>
                            <div className="relative space-y-4">
                                <div className="relative">
                                    <QueryEditor
                                        value={query}
                                        onChange={setQuery}
                                        suggestions={editorSuggestions}
                                        placeholder={
                                            selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale'
                                                ? "SELECT * FROM users WHERE id = :id"
                                                : selectedConnector?.type === 'memorystore-redis'
                                                    ? "GET :key  OR  { \"command\": \"hgetall\", \"args\": [\":key\"] }"
                                                    : "{ \"collection\": \"users\", \"filter\": { \"id\": \":id\" } }"
                                        }
                                    />
                                    <div className="absolute bottom-4 right-4 flex items-center gap-2">
                                <div className="relative">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={exportDataDictionary}
                                        className="h-6 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                    >
                                        <FileSpreadsheet className="w-3 h-3 mr-1.5" />
                                        Export Dictionary
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowTemplates(!showTemplates)}
                                        className={cn(
                                            "h-10 px-4 text-[8px] font-bold uppercase tracking-wider transition-colors",
                                            showTemplates ? "text-[var(--primary)] bg-[var(--primary)]/10" : "text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                        )}
                                        title="Query Templates"
                                    >
                                        <LayoutTemplate className="w-4 h-4 mr-2" />
                                        Templates
                                    </Button>
                                    {showTemplates && (
                                        <div className="absolute bottom-full mb-2 right-0 w-64 bg-[var(--popover)] border border-[var(--border)] rounded-xl shadow-2xl p-2 z-50 animate-in slide-in-from-bottom-2 fade-in">
                                            <div className="p-2 border-b border-[var(--border)] mb-1">
                                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">QUICK TEMPLATES</span>
                                            </div>
                                            <div className="space-y-1">
                                                {templates.map(t => (
                                                    <button
                                                        key={t.name}
                                                        onClick={() => {
                                                            setQuery(t.query);
                                                            setShowTemplates(false);
                                                        }}
                                                        className="w-full text-left p-2 hover:bg-[var(--primary)]/10 rounded-xl transition-colors group"
                                                    >
                                                        <span className="block text-[8px] font-bold uppercase tracking-wider group-hover:text-[var(--primary)]">{t.name}</span>
                                                        <code className="block text-[8px] font-mono text-[var(--muted-foreground)] truncate">{t.query}</code>
                                                    </button>
                                                ))}
                                                {templates.length === 0 && (
                                                    <div className="p-4 text-center">
                                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">NO TEMPLATES AVAILABLE</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={formatQuery}
                                    disabled={!query.trim()}
                                    className="h-10 px-4 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                    title="Format Query"
                                >
                                    <AlignLeft className="w-4 h-4 mr-2" />
                                    Format
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowSaveModal(true)}
                                    disabled={!query.trim()}
                                    className="h-10 px-4 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    Save
                                </Button>
                                {(selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale') && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => executeQuery(undefined, true)}
                                        disabled={isExplaining || isExecuting || !query.trim()}
                                        className="h-10 px-4 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                    >
                                        {isExplaining ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Info className="w-4 h-4 mr-2" />}
                                        Explain
                                    </Button>
                                )}
                                        <MovingBorderButton
                                            onClick={() => executeQuery()}
                                            disabled={isExecuting || !query.trim()}
                                            containerClassName="h-10 w-32"
                                            className="text-[8px] font-bold uppercase tracking-wider"
                                        >
                                            {isExecuting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                                            Run Query
                                        </MovingBorderButton>
                                    </div>
                            </div>

                                {detectedVars.length > 0 && (
                                    <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/5 animate-in slide-in-from-top-2">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Query Variables</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                            {detectedVars.map(v => (
                                                <div key={v} className="space-y-1.5">
                                                    <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/70">:{v}</Label>
                                                    <Input
                                                        value={queryVariables[v] || ''}
                                                        onChange={(e) => setQueryVariables(prev => ({ ...prev, [v]: e.target.value }))}
                                                        placeholder={`VALUE FOR :${v.toUpperCase()}`}
                                                        className="h-8 text-[8px] font-mono placeholder:text-[8px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                        </div>
                    </div>
                </div>
                ) : activeTab === 'saved' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
                        {savedQueries.length === 0 ? (
                            <div className="col-span-full py-8 text-center space-y-4 border border-dashed border-[var(--border)] rounded-2xl bg-[var(--muted)]/5">
                                <Save className="w-8 h-8 text-[var(--muted-foreground)]/30 mx-auto" />
                                <div className="space-y-1">
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">No saved queries yet</p>
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">Save frequently used queries for quick access</p>
                                </div>
                            </div>
                        ) : (
                            savedQueries.map(q => (
                                <Card key={q.id} className="p-4 bg-[var(--background)] border-[var(--border)] hover:border-[var(--primary)]/30 transition-all group">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                                                <Terminal className="w-3.5 h-3.5 text-[var(--primary)]" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-bold uppercase tracking-wider truncate max-w-[150px]">{q.name}</span>
                                                {q.isPublic && <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--success)]">Team Shared</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => {
                                                    if (selectedQueryComments === q.id) setSelectedQueryComments(null);
                                                    else {
                                                        setSelectedQueryComments(q.id);
                                                        fetchComments(q.id);
                                                    }
                                                }}
                                                className={cn("h-7 w-7", selectedQueryComments === q.id ? "text-[var(--primary)] bg-[var(--primary)]/10" : "text-[var(--muted-foreground)] hover:text-[var(--primary)]")}
                                            >
                                                <MessageSquare className="w-3.5 h-3.5" />
                                            </Button>
                                            {(!q.isPublic || q.userId === currentUserId) && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => deleteSavedQuery(q.id)}
                                                    className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--error)]"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <pre className="text-[8px] font-mono bg-[var(--muted)]/20 p-2 rounded mb-3 max-h-20 overflow-hidden line-clamp-3 text-[var(--muted-foreground)]">
                                        {q.query}
                                    </pre>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setQuery(q.query);
                                                setActiveTab('editor');
                                                executeQuery(q.query);
                                            }}
                                            className="flex-1 h-8 text-[8px] font-bold uppercase tracking-wider border-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                        >
                                            <Play className="w-3 h-3 mr-2" />
                                            Load & Run
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => cloneQuery(q)}
                                            className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                            title="Clone Query"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>

                                    {selectedQueryComments === q.id && (
                                        <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3 animate-in slide-in-from-top-2">
                                            <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                                                {(comments[q.id] || []).map(c => (
                                                    <div key={c.id} className="p-2 rounded bg-[var(--muted)]/10 border border-[var(--border)] space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">{c.userName}</span>
                                                            <span className="text-[8px] text-[var(--muted-foreground)]/60">{new Date(c.createdAt).toLocaleDateString()}</span>
                                                        </div>
                                                        <p className="text-[8px] text-[var(--foreground)]">{c.text}</p>
                                                    </div>
                                                ))}
                                                {(!comments[q.id] || comments[q.id].length === 0) && (
                                                    <div className="text-center py-2">
                                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/40">No comments yet</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <Input
                                                    value={newComment}
                                                    onChange={(e) => setNewComment(e.target.value)}
                                                    placeholder="ADD COMMENT..."
                                                    className="h-8 text-[8px] font-bold uppercase tracking-wider placeholder:text-[8px]"
                                                    onKeyDown={(e) => e.key === 'Enter' && postComment(q.id)}
                                                />
                                                <Button
                                                    size="icon"
                                                    onClick={() => postComment(q.id)}
                                                    disabled={isPostingComment || !newComment.trim()}
                                                    className="h-8 w-8 shrink-0 bg-[var(--primary)]"
                                                >
                                                    {isPostingComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            ))
                        )}
                    </div>
                ) : activeTab === 'dashboards' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                        {dashboards.length === 0 ? (
                            <div className="col-span-full py-12 text-center space-y-4 border border-dashed border-[var(--border)] rounded-2xl bg-[var(--muted)]/5">
                                <BarChart2 className="w-10 h-10 text-[var(--muted-foreground)]/30 mx-auto" />
                                <div className="space-y-1">
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">No dashboard widgets yet</p>
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">Add query results or charts to your dashboard for quick visualization</p>
                                </div>
                            </div>
                        ) : (
                            dashboards.map(widget => {
                                const widgetConnector = connectors.find(c => c.id === widget.storageId);
                                return (
                                    <Card key={widget.id} className="overflow-hidden border-[var(--border)] hover:border-[var(--primary)]/30 transition-all bg-[var(--background)] flex flex-col min-h-[400px] relative group">
                                        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--muted)]/5">
                                            <div className="flex items-center gap-2 overflow-hidden mr-2">
                                                <div className="w-6 h-6 rounded bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                                    <BarChart2 className="w-3 h-3 text-[var(--primary)]" />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[8px] font-bold uppercase tracking-wider truncate">{widget.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]/60 truncate">{widgetConnector?.name || 'UNKNOWN STORAGE'}</span>
                                                        {widget.isPublic && (
                                                            <span className="text-[8px] font-bold uppercase text-[var(--success)] shrink-0">Shared</span>
                                                        )}
                                                        {widget.refreshInterval && widget.refreshInterval > 0 && (
                                                            <span className="text-[8px] font-bold uppercase text-[var(--primary)] shrink-0 flex items-center">
                                                                <RefreshCw className="w-2.5 h-2.5 mr-1 animate-spin-slow" />
                                                                {widget.refreshInterval}s
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <select
                                                    value={widget.refreshInterval || 0}
                                                    onChange={(e) => updateDashboardWidget(widget.id, { refreshInterval: parseInt(e.target.value) })}
                                                    className="h-6 px-1 rounded bg-[var(--muted)]/20 border border-[var(--border)] text-[8px] font-bold uppercase tracking-wider"
                                                    title="Auto-refresh interval"
                                                >
                                                    <option value={0}>OFF</option>
                                                    <option value={30}>30S</option>
                                                    <option value={60}>60S</option>
                                                    <option value={300}>5M</option>
                                                </select>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        const shareUrl = `${window.location.origin}/share/dashboard/${widget.id}?p=${projectId}`;
                                                        navigator.clipboard.writeText(shareUrl);
                                                        setCopiedCell(`share-${widget.id}`);
                                                        updateDashboardWidget(widget.id, { isPublic: true });
                                                        setTimeout(() => setCopiedCell(null), 2000);
                                                    }}
                                                    className={cn(
                                                        "h-7 w-7 transition-colors",
                                                        widget.isPublic ? "text-[var(--success)]" : "text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                                    )}
                                                    title="Share publicly"
                                                >
                                                    {copiedCell === `share-${widget.id}` ? <CheckCircle2 className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        setSelectedId(widget.storageId);
                                                        setQuery(widget.query);
                                                        if (widget.chartConfig) {
                                                            setViewMode('chart');
                                                            setChartConfig(widget.chartConfig);
                                                        } else {
                                                            setViewMode('table');
                                                        }
                                                        setActiveTab('editor');
                                                        executeQuery(widget.query);
                                                    }}
                                                    className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                                    title="Open in Editor"
                                                >
                                                    <Terminal className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => deleteDashboardWidget(widget.id)}
                                                    className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--error)]"
                                                    title="Delete Widget"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="p-4 flex-1 overflow-auto">
                                            <DashboardWidget widget={widget} projectId={projectId} />
                                        </div>
                                    </Card>
                                );
                            })
                        )}
                    </div>
                ) : (
                    <div className="space-y-2 animate-fade-in">
                        {history.length === 0 ? (
                            <div className="py-8 text-center space-y-4 border border-dashed border-[var(--border)] rounded-2xl bg-[var(--muted)]/5">
                                <History className="w-8 h-8 text-[var(--muted-foreground)]/30 mx-auto" />
                                <div className="space-y-1">
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Query history is empty</p>
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/50">Your recently executed queries will appear here</p>
                                </div>
                            </div>
                        ) : (
                            <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background)]">
                                {history.map((h, i) => (
                                    <div
                                        key={h.id}
                                        className={`p-3 flex items-center justify-between group hover:bg-[var(--muted)]/10 transition-colors ${i !== history.length - 1 ? 'border-b border-[var(--border)]' : ''}`}
                                    >
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="flex flex-col items-center shrink-0">
                                                <Clock className="w-3.5 h-3.5 text-[var(--muted-foreground)]/50" />
                                                <div className="h-4 w-[1px] bg-[var(--border)] my-1" />
                                            </div>
                                            <div className="space-y-1 flex-1">
                                                <div className="flex items-center gap-3">
                                                    <code className="text-[8px] font-mono text-[var(--foreground)] line-clamp-1">{h.query}</code>
                                                    {h.error && <span className="text-[8px] font-bold uppercase bg-[var(--error)]/10 text-[var(--error)] px-1 rounded">Error</span>}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]/60">
                                                        {new Date(h.timestamp).toLocaleString()}
                                                    </span>
                                                    {h.executionTimeMs !== undefined && (
                                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]/60">
                                                            {h.executionTimeMs}ms
                                                        </span>
                                                    )}
                                                    {h.rowCount !== undefined && (
                                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--success)]/60">
                                                            {h.rowCount} rows
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setQuery(h.query);
                                                setActiveTab('editor');
                                                executeQuery(h.query);
                                            }}
                                            className="h-8 px-3 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <ChevronRight className="w-3.5 h-3.5 mr-1" />
                                            Re-run
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {showInsights && performanceData && (
                    <div className="p-4 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20 animate-fade-in space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="md:col-span-1 space-y-4">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-[var(--primary)]" />
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Historical Performance</span>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <span className="block text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Uptime / Success</span>
                                    <span className="text-[10px] font-bold text-[var(--success)]">{performanceData.successRate}%</span>
                                </div>
                                <div>
                                    <span className="block text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Avg Execution</span>
                                    <span className="text-[10px] font-bold text-[var(--primary)]">{performanceData.avgLatency}ms</span>
                                </div>
                                <div>
                                    <span className="block text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Queries (Last 100)</span>
                                    <span className="text-[10px] font-bold text-[var(--foreground)]">{performanceData.totalQueries}</span>
                                </div>
                            </div>
                        </div>
                        <div className="md:col-span-3 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Response Time Trend</span>
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--muted)]/20 px-1.5 py-0.5 rounded">Last 7 Days</span>
                            </div>
                            <div className="h-24 flex items-end gap-1.5">
                                {(performanceData.timeseries || []).map((day, i) => (
                                    <div key={i} className="flex-1 group relative">
                                        <div
                                            className="w-full bg-[var(--primary)]/40 hover:bg-[var(--primary)] transition-colors rounded-t-sm"
                                            style={{ height: `${Math.min(100, (day.avgLatency / 100) * 100)}%` }}
                                        />
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--popover)] text-[8px] font-bold px-2 py-1 rounded shadow-lg border border-[var(--border)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                            {day.date}: {Math.round(day.avgLatency)}ms
                                        </div>
                                    </div>
                                ))}
                                {(!performanceData.timeseries || performanceData.timeseries.length === 0) && (
                                    <div className="w-full h-full flex items-center justify-center border border-dashed border-[var(--border)] rounded-lg">
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Insufficient Data</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between">
                                {(performanceData.timeseries || []).map((day, i) => (
                                    <span key={i} className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">
                                        {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                                    </span>
                                ))}
                            </div>
                        </div>
                      </div>

                      {performanceData.hotspots && performanceData.hotspots.length > 0 && (
                          <div className="pt-4 border-t border-[var(--primary)]/10 space-y-3">
                              <div className="flex items-center gap-2">
                                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--error)]" />
                                  <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--error)]">Performance Hotspots (Slow Queries)</span>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                  {performanceData.hotspots.map((h, i) => (
                                      <div key={i} className="p-2 rounded bg-[var(--background)] border border-[var(--border)] flex items-center justify-between group">
                                          <div className="flex items-center gap-3 overflow-hidden">
                                              <span className="text-[8px] font-bold text-[var(--muted-foreground)] bg-[var(--muted)]/20 px-1.5 py-0.5 rounded shrink-0">{h.count}X</span>
                                              <code className="text-[8px] font-mono truncate text-[var(--foreground)]">{h.query}</code>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0">
                                              <span className="text-[8px] font-bold text-[var(--error)]">{h.avgLatency}ms</span>
                                              <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                      setQuery(h.query);
                                                      setActiveTab('editor');
                                                  }}
                                                  className="h-6 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity"
                                              >
                                                  Optimize
                                              </Button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                    </div>
                )}

                {schema && (
                    <div className="p-4 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20 animate-fade-in">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Info className="w-4 h-4 text-[var(--primary)]" />
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Schema Insight</span>
                                </div>
                                <div className="flex items-center gap-1 bg-[var(--muted)]/20 p-0.5 rounded-lg border border-[var(--border)]">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => addToDashboard(`DASHBOARD WIDGET ${dashboards.length + 1}`)}
                                        disabled={isSavingDashboard}
                                        className="h-6 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                    >
                                        {isSavingDashboard ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <BarChart2 className="w-3.5 h-3.5 mr-1.5" />}
                                        Add to Dashboard
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSchemaView('list')}
                                        className={cn(
                                            "h-6 px-2 text-[8px] font-bold uppercase tracking-wider",
                                            schemaView === 'list' ? "bg-[var(--background)] shadow-sm text-[var(--primary)]" : "text-[var(--muted-foreground)]"
                                        )}
                                    >
                                        <Table className="w-3 h-3 mr-1.5" />
                                        List
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSchemaView('graph')}
                                        className={cn(
                                            "h-6 px-2 text-[8px] font-bold uppercase tracking-wider",
                                            schemaView === 'graph' ? "bg-[var(--background)] shadow-sm text-[var(--primary)]" : "text-[var(--muted-foreground)]"
                                        )}
                                    >
                                        <Network className="w-3 h-3 mr-1.5" />
                                        Graph
                                    </Button>
                                </div>
                            </div>
                            {schema.columns && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={exportTypeScript}
                                    className="h-6 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)] hover:bg-[var(--primary)]/10"
                                >
                                    <FileCode className="w-3 h-3 mr-1.5" />
                                    Export Types (TS)
                                </Button>
                            )}
                        </div>

                        {schemaView === 'graph' && schema.tables && schema.columns ? (
                            <SchemaMap
                                tables={schema.tables}
                                columns={schema.columns}
                                onTableClick={(table) => setQuery(`SELECT * FROM ${table} LIMIT 10`)}
                            />
                        ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-4">
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Entities</span>
                                        <div className="flex items-center gap-1 bg-[var(--muted)]/20 p-0.5 rounded-lg border border-[var(--border)]">
                                            {(['all', 'tables', 'collections'] as const).map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => setEntityTypeFilter(t)}
                                                    className={cn(
                                                        "h-5 px-2 text-[7px] font-bold uppercase tracking-wider rounded-md transition-all",
                                                        entityTypeFilter === t ? "bg-[var(--background)] shadow-sm text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                    )}
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="relative w-full sm:w-48">
                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--muted-foreground)]" />
                                        <input
                                            type="text"
                                            value={entitySearchQuery}
                                            onChange={(e) => setEntitySearchQuery(e.target.value)}
                                            placeholder="SEARCH ENTITIES..."
                                            className="w-full h-7 pl-7 pr-2 rounded bg-[var(--background)] border border-[var(--border)] text-[8px] font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/50 placeholder:text-[var(--muted-foreground)]/50"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                    {selectedConnector?.type === 'memorystore-redis' && (schema as { sampleKeys?: string[] })?.sampleKeys ? (
                                        <div className="w-full">
                                            <RedisTree
                                                keys={(schema as { sampleKeys: string[] }).sampleKeys}
                                                onKeyClick={(key) => {
                                                    setQuery(`GET ${key}`);
                                                    executeQuery(`GET ${key}`);
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        (() => {
                                            const items = [
                                                ...(entityTypeFilter === 'all' || entityTypeFilter === 'tables' ? (schema.tables || []) : []),
                                                ...(entityTypeFilter === 'all' || entityTypeFilter === 'collections' ? (schema.collections || []) : [])
                                            ].filter(item => item.toLowerCase().includes(entitySearchQuery.toLowerCase()));

                                            if (items.length === 0) return (
                                                <div className="w-full py-8 text-center border border-dashed border-[var(--border)] rounded-xl opacity-40">
                                                    <span className="text-[8px] font-bold uppercase tracking-wider">No matching entities found</span>
                                                </div>
                                            );

                                            return items.map(item => (
                                                <button
                                                    key={item}
                                                    onClick={() => {
                                                        if (selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale') {
                                                            setQuery(`SELECT * FROM ${item} LIMIT 10`);
                                                        } else {
                                                            setQuery(`{ "collection": "${item}", "limit": 10 }`);
                                                        }
                                                    }}
                                                    className="px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[8px] font-mono hover:border-[var(--primary)] transition-colors flex items-center gap-2 group"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                            "w-1.5 h-1.5 rounded-full",
                                                            schema.tables?.includes(item) ? "bg-[var(--primary)]" : "bg-[var(--success)]"
                                                        )} />
                                                        <span>{item}</span>
                                                        {schema.tableStats?.[item] !== undefined && (
                                                            <span className="text-[8px] font-bold text-[var(--muted-foreground)]/50 uppercase tracking-wider">
                                                                ({schema.tableStats[item].estimatedRows.toLocaleString()} ROWS)
                                                            </span>
                                                        )}
                                                    </div>
                                                    <ChevronRight className="w-3 h-3 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" />
                                                </button>
                                            ));
                                        })()
                                    )}
                                </div>
                            </div>

                            {schema.columns && Object.keys(schema.columns).length > 0 && (
                                <div className="space-y-3 border-l border-[var(--border)] pl-4">
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Structure Preview</span>
                                    <div className="max-h-40 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                                        {Object.entries(schema.columns).map(([table, cols]) => (
                                            <div key={table} className="space-y-1.5 p-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]/5 group/table-item">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Table className="w-3 h-3 text-[var(--primary)]" />
                                                        <span className="text-[8px] font-bold uppercase tracking-wider">{table}</span>
                                                    </div>
                                                    {isSavingDoc === `table_${table}` && (
                                                        <Loader2 className="w-2.5 h-2.5 animate-spin text-[var(--primary)]" />
                                                    )}
                                                </div>
                                                <input
                                                    type="text"
                                                    defaultValue={schemaDocs.find(d => d.entity === table && d.type === 'table')?.description || ''}
                                                    onBlur={(e) => {
                                                        const desc = e.target.value.trim();
                                                        if (desc !== (schemaDocs.find(d => d.entity === table && d.type === 'table')?.description || '')) {
                                                            saveSchemaDoc(table, 'table', desc);
                                                        }
                                                    }}
                                                    placeholder="ADD TABLE DESCRIPTION..."
                                                    className="w-full bg-transparent border-none text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] placeholder:text-[8px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider placeholder:text-[var(--muted-foreground)]/30 focus:outline-none focus:ring-0 p-0 h-4 pl-5"
                                                />
                                                <div className="flex flex-wrap gap-1.5 pl-5">
                                                    {cols.map(c => (
                                                        <div key={c.name} className="flex flex-col gap-1 p-2 rounded bg-[var(--muted)]/20 border border-[var(--border)] group/col-item relative">
                                                            <div className="flex items-center justify-between gap-4">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[8px] font-mono font-bold">{c.name}</span>
                                                                    {c.isPrimary && <span className="text-[8px] font-bold text-[var(--primary)] mr-0.5">PK</span>}
                                                                    {c.isForeign && <span className="text-[8px] font-bold text-[var(--success)] mr-0.5">FK</span>}
                                                                    {c.indices && c.indices.map(idx => (
                                                                        <span key={idx} className="text-[8px] font-bold text-[var(--warning)] mr-0.5" title={idx}>IDX</span>
                                                                    ))}
                                                                    <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)] opacity-60">{c.type}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    {c.isForeign && c.referencesTable && (
                                                                        <button
                                                                            onClick={() => {
                                                                                const join = `JOIN ${c.referencesTable} ON ${table}.${c.name} = ${c.referencesTable}.${c.referencesColumn}`;
                                                                                navigator.clipboard.writeText(join);
                                                                                setCopiedCell(`join-${table}-${c.name}`);
                                                                                setTimeout(() => setCopiedCell(null), 2000);
                                                                            }}
                                                                            className="p-1 rounded bg-[var(--background)] border border-[var(--border)] hover:text-[var(--primary)] opacity-0 group-hover/col-item:opacity-100 transition-opacity"
                                                                            title="Copy JOIN snippet"
                                                                        >
                                                                            {copiedCell === `join-${table}-${c.name}` ? <CheckCircle2 className="w-3 h-3 text-[var(--success)]" /> : <LinkIcon className="w-3 h-3" />}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Documentation Field */}
                                                            <div className="relative group/doc">
                                                                <input
                                                                    type="text"
                                                                    defaultValue={schemaDocs.find(d => d.entity === `${table}.${c.name}` && d.type === 'column')?.description || ''}
                                                                    onBlur={(e) => {
                                                                        const desc = e.target.value.trim();
                                                                        if (desc !== (schemaDocs.find(d => d.entity === `${table}.${c.name}` && d.type === 'column')?.description || '')) {
                                                                            saveSchemaDoc(`${table}.${c.name}`, 'column', desc);
                                                                        }
                                                                    }}
                                                                    placeholder="ADD COLUMN DESCRIPTION..."
                                                                    className="w-full bg-transparent border-none text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] placeholder:text-[8px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider placeholder:text-[var(--muted-foreground)]/30 focus:outline-none focus:ring-0 p-0 h-4"
                                                                />
                                                                {isSavingDoc === `column_${table}.${c.name}` && (
                                                                    <Loader2 className="absolute right-0 top-0 w-2.5 h-2.5 animate-spin text-[var(--primary)]" />
                                                                )}
                                                            </div>

                                                            {c.distribution && (
                                                                <div className="w-full h-6 mt-1">
                                                                    <ResponsiveContainer width="100%" height="100%">
                                                                        <BarChart data={c.distribution}>
                                                                            <Bar dataKey="value" fill="var(--primary)" opacity={0.3} />
                                                                        </BarChart>
                                                                    </ResponsiveContainer>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3 text-[var(--error)]">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="text-[8px] font-bold uppercase tracking-wider">{error}</span>
                    </div>
                )}

                {results && (
                    <div className="space-y-3 animate-fade-in">
                        <div className="p-3 border border-[var(--border)] rounded-xl bg-[var(--muted)]/5 flex items-center gap-3">
                            <Search className="w-4 h-4 text-[var(--muted-foreground)]" />
                            <Input
                                value={filterQuery}
                                onChange={(e) => {
                                    setFilterQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                placeholder="FILTER RESULTS LOCALLY..."
                                className="h-8 border-none bg-transparent focus-visible:ring-0 text-[8px] font-bold uppercase tracking-wider placeholder:text-[8px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                            />
                            {filterQuery && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setFilterQuery('')}
                                    className="h-6 w-6 text-[var(--muted-foreground)]"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                            )}
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                {resultSets && resultSets.length > 1 && (
                                    <div className="flex items-center gap-1 bg-[var(--muted)]/20 p-1 rounded-xl border border-[var(--border)] mr-2">
                                        {resultSets.map((_, idx) => (
                                            <Button
                                                key={idx}
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setActiveResultSet(idx);
                                                    setResults(resultSets[idx].results);
                                                    setRowCount(resultSets[idx].rowCount);
                                                    setCurrentPage(1);
                                                }}
                                                className={cn(
                                                    "h-7 px-3 text-[8px] font-bold uppercase tracking-wider",
                                                    activeResultSet === idx ? "bg-[var(--background)] shadow-sm text-[var(--primary)]" : "text-[var(--muted-foreground)]"
                                                )}
                                            >
                                                SET {idx + 1}
                                            </Button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-wider text-[var(--success)]">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Query Executed Successfully
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                            Total: <span className="text-[var(--foreground)]">{rowCount ?? results.length}</span>
                                        </span>
                                        {filterQuery && (
                                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                Filtered: <span className="text-[var(--success)]">{processedResults?.length}</span>
                                            </span>
                                        )}
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                            Time: <span className="text-[var(--primary)]">{executionTime}ms</span>
                                        </span>
                                    </div>
                                </div>
                                <Separator orientation="vertical" className="h-8 bg-[var(--border)]" />
                                <div className="flex items-center gap-1">
                                    <div className="flex items-center bg-[var(--muted)]/20 rounded-lg p-0.5 border border-[var(--border)] mr-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={copyResultsCSV}
                                            className="h-5 px-1.5 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                            title="Copy Results as CSV"
                                        >
                                            {copiedResults === 'csv' ? <CheckCircle2 className="w-3 h-3 text-[var(--success)] mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                                            CSV
                                        </Button>
                                        <Separator orientation="vertical" className="h-3 bg-[var(--border)] mx-0.5" />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={copyResultsJSON}
                                            className="h-5 px-1.5 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                            title="Copy Results as JSON"
                                        >
                                            {copiedResults === 'json' ? <CheckCircle2 className="w-3 h-3 text-[var(--success)] mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                                            JSON
                                        </Button>
                                        <Separator orientation="vertical" className="h-3 bg-[var(--border)] mx-0.5" />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={copyAsCode}
                                            className="h-5 px-1.5 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                            title="Copy as Node.js Code"
                                        >
                                            {copiedResults === 'code' ? <CheckCircle2 className="w-3 h-3 text-[var(--success)] mr-1" /> : <FileCode className="w-3 h-3 mr-1" />}
                                            CODE
                                        </Button>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={downloadCSV}
                                        className="h-6 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                    >
                                        <Download className="w-3.5 h-3.5 mr-1.5" />
                                        CSV
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={downloadJSON}
                                        className="h-6 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                    >
                                        <Terminal className="w-3.5 h-3.5 mr-1.5" />
                                        JSON
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={downloadPDF}
                                        disabled={isExportingPDF}
                                        className="h-6 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                                    >
                                        {isExportingPDF ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <FileCode className="w-3.5 h-3.5 mr-1.5" />}
                                        PDF
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={clearResults}
                                        className="h-6 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--error)] hover:bg-[var(--error)]/10"
                                    >
                                        <X className="w-3.5 h-3.5 mr-1.5" />
                                        Clear
                                    </Button>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 bg-[var(--muted)]/20 p-1 rounded-lg border border-[var(--border)]">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setViewMode('table')}
                                    className={`h-7 px-3 text-[8px] font-bold uppercase tracking-wider ${viewMode === 'table' ? 'bg-[var(--background)] shadow-sm text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}
                                >
                                    <Table className="w-3.5 h-3.5 mr-1.5" />
                                    Table
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setViewMode('json')}
                                    className={`h-7 px-3 text-[8px] font-bold uppercase tracking-wider ${viewMode === 'json' ? 'bg-[var(--background)] shadow-sm text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}
                                >
                                    <Terminal className="w-3.5 h-3.5 mr-1.5" />
                                    JSON
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setViewMode('chart')}
                                    className={`h-7 px-3 text-[8px] font-bold uppercase tracking-wider ${viewMode === 'chart' ? 'bg-[var(--background)] shadow-sm text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}
                                >
                                    <PieChartIcon className="w-3.5 h-3.5 mr-1.5" />
                                    Chart
                                </Button>
                                {(selectedConnector?.type.includes('sql') || selectedConnector?.type === 'planetscale') && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setViewMode('explain')}
                                        className={`h-7 px-3 text-[8px] font-bold uppercase tracking-wider ${viewMode === 'explain' ? 'bg-[var(--background)] shadow-sm text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}
                                    >
                                        <Activity className="w-3.5 h-3.5 mr-1.5" />
                                        Explain
                                    </Button>
                                )}
                            </div>
                        </div>
                        {optimizationSuggestions && (
                            <div className="p-4 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20 animate-in slide-in-from-top-2 mb-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-[var(--primary)]" />
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">Optimization Suggestions (Virtual DBA)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[7px] font-bold uppercase text-[var(--muted-foreground)]">Avg Impact Score:</span>
                                        <div className="flex items-center gap-0.5">
                                            {(() => {
                                                const total = optimizationSuggestions.length;
                                                const avgScore = total > 0 ? optimizationSuggestions.reduce((a, b) => a + b.score, 0) / total : 0;
                                                const stars = Math.round(avgScore / 20);
                                                return [1, 2, 3, 4, 5].map(star => (
                                                    <div
                                                        key={star}
                                                        className={cn(
                                                            "w-1.5 h-1.5 rounded-full shadow-[0_0_5px_rgba(var(--primary-rgb),0.5)]",
                                                            star <= stars ? "bg-[var(--primary)]" : "bg-[var(--border)]"
                                                        )}
                                                    />
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {optimizationSuggestions.sort((a, b) => b.score - a.score).map((s, i) => (
                                        <div key={i} className={cn(
                                            "flex items-start gap-3 text-[8px] font-bold uppercase tracking-wider p-2 rounded border transition-all",
                                            s.severity === 'high' ? "bg-[var(--error)]/5 border-[var(--error)]/20 text-[var(--error)]" :
                                            s.severity === 'medium' ? "bg-[var(--warning)]/5 border-[var(--warning)]/20 text-[var(--warning)]" :
                                            "bg-[var(--primary)]/5 border-[var(--primary)]/20 text-[var(--muted-foreground)]"
                                        )}>
                                            <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                                                <Info className="w-3.5 h-3.5" />
                                                <span className="text-[7px] font-bold">{s.score}</span>
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-1 py-0.5 rounded bg-current/10 text-[7px]">{s.severity.toUpperCase()}</span>
                                                    <span className="opacity-90">{s.message}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="min-h-[300px] max-h-[600px] overflow-auto">
                            {viewMode === 'explain' && results ? (
                                <VisualExplain
                                    data={results}
                                    type={selectedConnector?.type.includes('postgres') || selectedConnector?.type === 'supabase' ? 'postgres' : 'mysql'}
                                />
                            ) : viewMode === 'chart' ? (
                                renderChart()
                            ) : viewMode === 'table' ? (
                                <>
                                    {renderResultsTable()}
                                    {totalPages > 1 && (
                                        <div className="mt-4 flex items-center justify-between px-2">
                                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                                Page {currentPage} of {totalPages}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={currentPage === 1}
                                                    onClick={() => setCurrentPage(prev => prev - 1)}
                                                    className="h-7 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"
                                                >
                                                    <ChevronLeft className="w-4 h-4 mr-1" />
                                                    Previous
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={currentPage === totalPages}
                                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                                    className="h-7 px-2 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"
                                                >
                                                    Next
                                                    <ChevronRight className="w-4 h-4 ml-1" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/10 p-4">
                                    <pre className="text-[8px] font-mono text-[var(--foreground)]">
                                        {JSON.stringify(results, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="p-4 bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-xl flex items-start gap-3">
                    <Database className="w-4 h-4 text-[var(--info)] shrink-0 mt-0.5" />
                    <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] leading-relaxed">
                        Data Lab uses a secure proxy to execute read-only commands against your connected infrastructure. Your credentials never leave our VPC.
                    </p>
                </div>
            </div>

            {/* View Audit Query Modal */}
            {viewingAuditQuery && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                                    <Terminal className="w-4 h-4 text-[var(--primary)]" />
                                </div>
                                <h3 className="text-[10px] font-bold">Audit Query Source</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setViewingAuditQuery(null)} className="h-8 w-8">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="p-6">
                            <div className="p-4 bg-black/40 border border-[var(--border)] rounded-xl font-mono text-[8px] max-h-96 overflow-y-auto custom-scrollbar">
                                <pre className="whitespace-pre-wrap break-all text-[var(--foreground)]/80 leading-relaxed">
                                    {viewingAuditQuery}
                                </pre>
                            </div>
                        </div>
                        <div className="p-6 bg-[var(--muted)]/5 border-t border-[var(--border)] flex justify-end gap-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    navigator.clipboard.writeText(viewingAuditQuery || '');
                                    toast.success('Query copied to clipboard');
                                }}
                                className="text-[8px] font-bold uppercase tracking-wider"
                            >
                                <Copy className="w-3.5 h-3.5 mr-2" />
                                Copy Query
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    setQuery(viewingAuditQuery || '');
                                    setViewingAuditQuery(null);
                                    setActiveTab('editor');
                                }}
                                className="text-[8px] font-bold uppercase tracking-wider bg-[var(--primary)]"
                            >
                                <Play className="w-3.5 h-3.5 mr-2" />
                                Load in Editor
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Save Query Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                                    {isCloning ? <Copy className="w-4 h-4 text-[var(--primary)]" /> : <Save className="w-4 h-4 text-[var(--primary)]" />}
                                </div>
                                <h3 className="text-[10px] font-bold">{isCloning ? 'Clone Query' : 'Save Query'}</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => {
                                setShowSaveModal(false);
                                setIsCloning(false);
                                setNewQueryName('');
                            }} className="h-8 w-8">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Query Name</Label>
                                <Input
                                    value={newQueryName}
                                    onChange={(e) => setNewQueryName(e.target.value)}
                                    placeholder="E.G. ACTIVE USERS"
                                    className="placeholder:text-[8px]"
                                    autoFocus
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 border border-[var(--border)] rounded-xl bg-[var(--muted)]/5">
                                <div className="space-y-0.5">
                                    <Label className="text-[8px] font-bold uppercase tracking-wider">Share with Team</Label>
                                    <p className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]/60">Allow other team members to use this query</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={isQueryPublic}
                                    onChange={(e) => setIsQueryPublic(e.target.checked)}
                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">SQL/JSON Code</Label>
                                <pre className="p-3 bg-[var(--muted)]/20 rounded-xl text-[8px] font-mono line-clamp-4 text-[var(--muted-foreground)]">
                                    {query}
                                </pre>
                            </div>
                        </div>
                        <div className="p-6 bg-[var(--muted)]/5 border-t border-[var(--border)] flex justify-end gap-3">
                            <Button variant="ghost" size="sm" onClick={() => {
                                setShowSaveModal(false);
                                setIsCloning(false);
                                setNewQueryName('');
                            }} className="text-[8px] font-bold uppercase tracking-wider">
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={saveQuery}
                                disabled={isSavingQuery || !newQueryName.trim()}
                                className="text-[8px] font-bold uppercase tracking-wider bg-[var(--primary)]"
                            >
                                {isSavingQuery ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : (isCloning ? <Copy className="w-3.5 h-3.5 mr-2" /> : <Save className="w-3.5 h-3.5 mr-2" />)}
                                {isCloning ? 'Clone Query' : 'Save Query'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </Card>
    );
}

function DashboardWidget({ widget, projectId }: { widget: { id: string, name: string, query: string, chartConfig: { type: 'bar' | 'line' | 'area' | 'pie', xAxis: string, yAxis: string } | null, storageId: string, refreshInterval?: number }, projectId: string }) {
    const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(async () => {
        setIsExecuting(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/storage/${widget.storageId}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: widget.query }),
            });
            const data = await response.json();
            if (data.success) {
                setResults(data.results);
            } else {
                setError(data.error);
            }
        } catch {
            setError('Failed to fetch widget data');
        } finally {
            setIsExecuting(false);
        }
    }, [projectId, widget.storageId, widget.query]);

    useEffect(() => {
        execute();

        if (widget.refreshInterval && widget.refreshInterval > 0) {
            const interval = setInterval(execute, widget.refreshInterval * 1000);
            return () => clearInterval(interval);
        }
    }, [widget.refreshInterval, execute]);

    if (isExecuting) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Executing Query...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-3 text-[var(--error)]">
                <AlertCircle className="w-6 h-6" />
                <span className="text-[8px] font-bold uppercase tracking-wider">{error}</span>
            </div>
        );
    }

    if (!results || results.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-3 text-[var(--muted-foreground)]">
                <Search className="w-6 h-6 opacity-20" />
                <span className="text-[8px] font-bold uppercase tracking-wider">No results found</span>
            </div>
        );
    }

    if (widget.chartConfig) {
        const type = widget.chartConfig.type;
        const ChartComponent = type === 'bar' ? BarChart : type === 'line' ? LineChart : AreaChart;
        const DataComponent = (type === 'bar' ? Bar : type === 'line' ? Line : Area) as React.ElementType;

        return (
            <div className="h-full w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    {type === 'pie' ? (
                        <PieChart>
                            <Pie
                                data={results}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                fill="var(--primary)"
                                dataKey={String(widget.chartConfig.yAxis)}
                                nameKey={String(widget.chartConfig.xAxis)}
                            >
                                {results.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--popover)',
                                    borderColor: 'var(--border)',
                                    borderRadius: '8px',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase'
                                }}
                            />
                        </PieChart>
                    ) : (
                        <ChartComponent data={results}>
                            <XAxis
                                dataKey={String(widget.chartConfig.xAxis)}
                                stroke="var(--muted-foreground)"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val: unknown) => String(val).toUpperCase()}
                            />
                            <YAxis
                                stroke="var(--muted-foreground)"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--popover)',
                                    borderColor: 'var(--border)',
                                    borderRadius: '8px',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase'
                                }}
                            />
                            <DataComponent
                                type="monotone"
                                dataKey={String(widget.chartConfig.yAxis)}
                                fill="var(--primary)"
                                stroke="var(--primary)"
                                fillOpacity={0.3}
                                strokeWidth={2}
                                radius={[4, 4, 0, 0]}
                            />
                        </ChartComponent>
                    )}
                </ResponsiveContainer>
            </div>
        );
    }

    const columns = Object.keys(results[0]).slice(0, 5); // Limit columns for dashboard view
    return (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] h-full">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-[var(--muted)]/20 border-b border-[var(--border)]">
                        {columns.map(col => (
                            <th key={col} className="p-2 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                                {col}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {results.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-[var(--border)] last:border-0">
                            {columns.map(col => (
                                <td key={col} className="p-2 text-[8px] font-mono truncate max-w-[120px]">
                                    {typeof row[col] === 'object' ? '{...}' : String(row[col])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {results.length > 5 && (
                <div className="p-2 text-center border-t border-[var(--border)]">
                    <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]/60">
                        + {results.length - 5} MORE ROWS
                    </span>
                </div>
            )}
        </div>
    );
}
