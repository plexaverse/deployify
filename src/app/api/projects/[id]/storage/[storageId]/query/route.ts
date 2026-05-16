import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { getDb, Collections } from '@/lib/firebase';
import { selectReplica, type ReplicaMetadata } from '@/lib/db';
import type { StorageConfig } from '@/types';
import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { maskData } from '@/lib/utils/masking';

const MAX_ROWS = 500;

/**
 * Production-ready read-only query browser proxy
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const body = await request.json();
        let { query } = body;
        const { variables = {}, widgetId } = body;

        let session = null;
        let storageConfig: StorageConfig | undefined;
        let access: import('@/middleware/rbac').ProjectAccessResult | null = null;

        // 1. Authorization Logic
        if (widgetId) {
            // Public Widget Path: No session required, but must be a valid public widget
            const db = getDb();
            const widgetDoc = await db.collection(Collections.PROJECTS).doc(id).collection('storage_dashboards').doc(widgetId).get();

            if (!widgetDoc.exists) {
                return NextResponse.json({ success: false, error: 'Widget not found' }, { status: 404 });
            }

            const widgetData = widgetDoc.data();
            if (!widgetData?.isPublic) {
                return NextResponse.json({ success: false, error: 'Forbidden: Widget is not public' }, { status: 403 });
            }

            // Enforce the saved query for public access
            query = widgetData.query;

            // Still need storage config
            if (process.env.MOCK_DB === 'true' && id === 'audit-id') {
                storageConfig = { id: 'mock-storage-id', type: 'cloud-sql-postgres', name: 'MOCK STORAGE' } as StorageConfig;
            } else {
                const projectDoc = await db.collection(Collections.PROJECTS).doc(id).get();
                const projectData = projectDoc.data();
                storageConfig = projectData?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
            }
        } else {
            // Standard Path: Session required
            session = await getSession();
            if (!session) {
                return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
            }

            if (process.env.MOCK_DB === 'true' && id === 'audit-id') {
                storageConfig = { id: 'mock-storage-id', type: 'cloud-sql-postgres', name: 'MOCK STORAGE' } as StorageConfig;
            } else {
                access = await checkProjectAccess(session.user.id, id);
                if (!access.allowed) {
                    return NextResponse.json({ success: false, error: access.error }, { status: access.status });
                }
                storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
            }
        }

        if (!storageConfig) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        if (!query) {
            return NextResponse.json({ success: false, error: 'Query is required' }, { status: 400 });
        }

        const isSqlLike = storageConfig.type.includes('sql') || storageConfig.type === 'planetscale';
        const isPostgres = storageConfig.type === 'cloud-sql-postgres' || storageConfig.type === 'supabase';
        let sqlParams: unknown[] = [];

        // Apply variable substitution
        if (Object.keys(variables).length > 0 && query !== 'DISCOVER_SCHEMA') {
            if (isSqlLike) {
                // For SQL, we use true parameterized queries
                const varNames = Object.keys(variables);
                const sortedNames = [...varNames].sort((a, b) => b.length - a.length);

                if (isPostgres) {
                    // Postgres uses $1, $2, etc.
                    const usedVars: string[] = [];
                    for (const name of sortedNames) {
                        const regex = new RegExp(`:${name}\\b`, 'g');
                        if (regex.test(query)) {
                            let idx = usedVars.indexOf(name);
                            if (idx === -1) {
                                usedVars.push(name);
                                idx = usedVars.length - 1;
                                sqlParams.push(variables[name]);
                            }
                            // Replace all occurrences of this variable with the same $idx
                            query = query.replace(regex, `$${idx + 1}`);
                        }
                    }
                } else {
                    // MySQL/PlanetScale uses ? (positional)
                    const mysqlParams: unknown[] = [];
                    const pattern = new RegExp(`:(${sortedNames.join('|')})\\b`, 'g');
                    query = query.replace(pattern, (_match: string, name: string) => {
                        mysqlParams.push(variables[name]);
                        return '?';
                    });
                    sqlParams = mysqlParams;
                }
            } else {
                // For NoSQL/Redis, keep string replacement as they use JSON/command strings
                const sortedVarNames = Object.keys(variables).sort((a, b) => b.length - a.length);
                for (const key of sortedVarNames) {
                    const val = variables[key];
                    const replaceVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
                    const regex = new RegExp(`:${key}\\b`, 'g');
                    query = query.replace(regex, replaceVal);
                }
            }
        }

        // Strict Read-Only Enforcement for SQL
        if (storageConfig.type.includes('sql') || storageConfig.type === 'planetscale') {
            // Remove comments and whitespace to get the true command
            const cleanQuery = query.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').replace(/#.*$/gm, '').trim();

            const forbiddenKeywords = [
                'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'REPLACE', 'TRUNCATE',
                'GRANT', 'REVOKE', 'SET', 'EXECUTE', 'PREPARE', 'CALL', 'MERGE', 'RENAME', 'COMMENT',
                'VACUUM', 'COPY', 'LOAD', 'INTO OUTFILE', 'INTO DUMPFILE', 'LOCK', 'UNLOCK'
            ];
            const allowedPrefixes = ['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'DISCOVER_SCHEMA', 'WITH'];

            // Handle multi-statement queries by splitting by semicolon
            // We only split if semicolon is NOT inside a string literal
            const statements = cleanQuery.split(/;(?=(?:[^']*'[^']*')*[^']*$)/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);

            for (const statement of statements) {
                const normalizedStatement = statement.toUpperCase();
                const statementWithoutLiterals = normalizedStatement.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');

                const hasForbidden = forbiddenKeywords.some(kw => {
                    const regex = new RegExp(`\\b${kw}\\b`, 'i');
                    return regex.test(statementWithoutLiterals);
                });

                const hasAllowedPrefix = allowedPrefixes.some(prefix => normalizedStatement.startsWith(prefix));

                // Extra safety for EXPLAIN/WITH which can wrap data-modifying statements
                if (normalizedStatement.startsWith('EXPLAIN') || normalizedStatement.startsWith('WITH')) {
                    if (hasForbidden) {
                        return NextResponse.json({ success: false, error: 'Forbidden: This query contains data-modifying statements' }, { status: 403 });
                    }
                }

                if (hasForbidden || !hasAllowedPrefix) {
                    return NextResponse.json({ success: false, error: 'Forbidden: Only read-only queries are allowed in Data Lab' }, { status: 403 });
                }
            }
        }

        // 1. Get credentials securely (Smart Routing for Replicas)
        let connectionString = '';
        const replicas = (storageConfig.metadata?.replicas as ReplicaMetadata[]) || [];
        const selectedReplica = selectReplica(replicas, storageConfig.readWeights);
        const isReadOnlyQuery = query !== 'DISCOVER_SCHEMA' && !query.toUpperCase().includes(';') && (query.toUpperCase().startsWith('SELECT') || query.toUpperCase().startsWith('EXPLAIN') || query.toUpperCase().startsWith('WITH'));

        if (selectedReplica && isReadOnlyQuery && storageConfig.type.includes('cloud-sql')) {
            const { getReplicaConnectionString } = await import('@/lib/gcp/cloudsql');
            const dbType = storageConfig.type.includes('postgres') ? 'postgres' : 'mysql';
            // Intelligent Traffic Steering: Distribute query load across all healthy replicas picking the best one
            connectionString = getReplicaConnectionString(selectedReplica.name, selectedReplica.region, dbType);
        } else if (storageConfig.connectionStringSecretId) {
            connectionString = await getSecretValue(storageConfig.connectionStringSecretId);
        }

        if (!connectionString && process.env.MOCK_DB !== 'true') {
            return NextResponse.json({ success: false, error: 'Connection string not configured' }, { status: 400 });
        }

        // 2. Execute Query (Mocked or Real)
        const startTime = Date.now();
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Query execution timeout after 25s')), 25000)
            );

            const resultPromise = (async () => {
                if (process.env.MOCK_DB === 'true') {
                    // Handle Schema Discovery Mock
                    if (query === 'DISCOVER_SCHEMA') {
                        const mockSchema = storageConfig.type === 'firestore' || storageConfig.type === 'mongodb-atlas'
                            ? { collections: ['users', 'projects', 'deployments', 'analytics'] }
                            : storageConfig.type === 'memorystore-redis'
                                ? { keys: ['user:1', 'user:2', 'session:active', 'cache:config'] }
                                : {
                                    tables: ['users', 'projects', 'deployments', 'domains', 'env_vars'],
                                    tableStats: {
                                        'users': { estimatedRows: 1250 },
                                        'projects': { estimatedRows: 450 },
                                        'deployments': { estimatedRows: 8900 }
                                    },
                                    columns: {
                                        'users': [
                                            { name: 'id', type: 'uuid', isPrimary: true, indices: ['users_pkey'] },
                                            { name: 'email', type: 'varchar', indices: ['users_email_idx'] },
                                            { name: 'created_at', type: 'timestamp' }
                                        ],
                                        'projects': [
                                            { name: 'id', type: 'uuid', isPrimary: true, indices: ['projects_pkey'] },
                                            { name: 'userId', type: 'uuid', isForeign: true, indices: ['projects_user_id_idx'] },
                                            { name: 'name', type: 'varchar' },
                                            { name: 'slug', type: 'varchar', indices: ['projects_slug_unique'] }
                                        ],
                                        'deployments': [
                                            { name: 'id', type: 'uuid', isPrimary: true, indices: ['deployments_pkey'] },
                                            { name: 'projectId', type: 'uuid', isForeign: true, indices: ['deployments_project_id_idx'] },
                                            { name: 'status', type: 'varchar' }
                                        ]
                                    }
                                };

                        // For mock mode, provide some samples for sparklines
                        const mockSamples = [
                            { _table: 'users', id: 1, email: 'a@b.com' },
                            { _table: 'users', id: 2, email: 'c@d.com' },
                            { _table: 'users', id: 1, email: 'e@f.com' }, // Multiples for distribution
                            { _table: 'projects', id: 10, userId: 1 },
                            { _table: 'projects', id: 11, userId: 1 },
                            { _table: 'projects', id: 12, userId: 2 },
                        ];

                        return NextResponse.json({
                            success: true,
                            schema: mockSchema,
                            samples: mockSamples,
                            executionTimeMs: 5
                        });
                    }

                    // Handle EXPLAIN mock results
                    if (isSqlLike && query.toUpperCase().startsWith('EXPLAIN')) {
                        const isPostgres = storageConfig.type === 'cloud-sql-postgres' || storageConfig.type === 'supabase';
                        const mockExplainResults = isPostgres
                            ? [
                                { 'QUERY PLAN': 'Limit  (cost=0.00..0.01 rows=3 width=112)' },
                                { 'QUERY PLAN': '  ->  Seq Scan on users  (cost=0.00..34.50 rows=1250 width=112)' },
                                { 'QUERY PLAN': '        Filter: (id = 1)' }
                            ]
                            : [
                                { id: 1, select_type: 'SIMPLE', table: 'users', partitions: null, type: 'ALL', possible_keys: null, key: null, key_len: null, ref: null, rows: 1250, filtered: 10.00, Extra: 'Using filesort; Using temporary' }
                            ];

                        const optimizationSuggestions: { message: string, severity: 'high' | 'medium' | 'low', score: number, action?: { type: string, table: string, column?: string } }[] = [];
                        if (isPostgres) {
                            optimizationSuggestions.push({
                                message: 'POSTGRES: Full table scan detected on "users" with Filter on 1250 rows. Consider adding an index for the columns in the FILTER clause to improve performance.',
                                severity: 'high',
                                score: 85
                            });
                        } else {
                            optimizationSuggestions.push({
                                message: 'MYSQL: Full table scan (type: ALL) detected on "users". Consider adding an index to avoid scanning all 1250 rows.',
                                severity: 'high',
                                score: 90
                            });
                            optimizationSuggestions.push({
                                message: 'MYSQL: Query is using a temporary table and filesort. This often indicates missing indexes on ORDER BY or GROUP BY columns.',
                                severity: 'medium',
                                score: 65
                            });
                        }

                        return NextResponse.json({
                            success: true,
                            results: mockExplainResults,
                            rowCount: mockExplainResults.length,
                            optimizationSuggestions,
                            executionTimeMs: 2
                        });
                    }

                    // Handle multiple statements in mock mode (SQL only)
                    if (isSqlLike && query.includes(';')) {
                        const statements = query.split(';').filter((s: string) => s.trim().length > 0);
                        if (statements.length > 1) {
                            const resultSets = statements.map((s: string, i: number) => ({
                                results: [
                                    { id: i + 1, statement: s.trim().substring(0, 30), type: 'MOCK_SET' },
                                    { id: i + 10, statement: 'SECOND_ROW', type: 'MOCK_SET' }
                                ],
                                rowCount: 2
                            }));
                            return NextResponse.json({
                                success: true,
                                resultSets,
                                executionTimeMs: 10
                            });
                        }
                    }

                    // Simulated results for demonstration
                    const mockResults = [
                        { id: 1, name: 'Sample User', email: 'user@example.com', created_at: new Date().toISOString() },
                        { id: 2, name: 'Jane Doe', email: 'jane@example.com', created_at: new Date().toISOString() },
                        { id: 3, name: 'John Smith', email: 'john@example.com', created_at: new Date().toISOString() },
                    ];

                    const limitMatch = query.match(/limit (\d+)/i);
                    const requestedLimit = limitMatch ? parseInt(limitMatch[1]) : 100;
                    const finalLimit = Math.min(requestedLimit, MAX_ROWS);

                    return NextResponse.json({
                        success: true,
                        results: mockResults.slice(0, finalLimit),
                        rowCount: Math.min(mockResults.length, finalLimit),
                        executionTimeMs: Math.floor(Math.random() * 50) + 10,
                    });
                }

                // Real Connectivity Logic (Production Proxy)
                if (query === 'DISCOVER_SCHEMA' && (storageConfig.type === 'firestore' || storageConfig.type === 'mongodb-atlas')) {
                    const { discoverNoSqlSchema } = await import('@/lib/gcp/monitoring');
                    const report = await discoverNoSqlSchema(storageConfig, connectionString);
                    return NextResponse.json({
                        success: true,
                        schema: {
                            collections: report.entities.map(e => e.entity),
                            noSqlEntities: report.entities
                        },
                        executionTimeMs: Date.now() - startTime
                    });
                }

                if (storageConfig.type.includes('sql') || storageConfig.type === 'planetscale') {
                    const isPostgres = storageConfig.type === 'cloud-sql-postgres' || storageConfig.type === 'supabase';
                    const isIamAuth = connectionString.includes('enable_iam_auth=true');

                    // Determine SQL connection configuration (Handle IAM Auth)
                    let sqlConfig: string | Record<string, unknown> = connectionString;
                    if (isIamAuth && process.env.MOCK_DB !== 'true') {
                        try {
                            const url = new URL(connectionString);
                            const accessToken = await getGcpAccessToken();
                            const socketPath = url.searchParams.get('host');

                            if (isPostgres) {
                                sqlConfig = {
                                    host: socketPath || url.hostname,
                                    port: url.port ? parseInt(url.port, 10) : 5432,
                                    user: url.username || 'deployify-sa',
                                    password: accessToken,
                                    database: url.pathname.split('/')[1] || 'postgres',
                                    ssl: socketPath ? false : (storageConfig.ssl ? { rejectUnauthorized: true } : { rejectUnauthorized: false })
                                };
                            } else {
                                sqlConfig = {
                                    host: url.hostname,
                                    port: url.port ? parseInt(url.port, 10) : 3306,
                                    socketPath: socketPath || undefined,
                                    user: url.username || 'deployify-sa',
                                    password: accessToken,
                                    database: url.pathname.split('/')[1] || 'mysql',
                                    ssl: socketPath ? false : (storageConfig.ssl ? { rejectUnauthorized: true } : { rejectUnauthorized: false }),
                                    multipleStatements: true
                                };
                            }
                        } catch (e) {
                            console.error('Failed to parse IAM connection string:', e);
                            // Fallback to raw string if parsing fails
                        }
                    }

                    if (query === 'DISCOVER_SCHEMA') {
                        if (isPostgres) {
                            const client = new PgClient(sqlConfig);
                            try {
                                await client.connect();
                                // Fetch tables
                                const tablesRes = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
                                const tables = tablesRes.rows.map(r => r.table_name);

                                // Fetch columns for each table with PK/FK intelligence and estimated row counts
                                const columns: Record<string, { name: string, type: string, isPrimary?: boolean, isForeign?: boolean, indices?: string[] }[]> = {};
                                const tableStats: Record<string, { estimatedRows: number }> = {};
                                const samples: Record<string, unknown>[] = [];

                                for (const table of tables) {
                                    // Estimated row count for Postgres
                                    const countRes = await client.query('SELECT reltuples AS estimate FROM pg_class WHERE relname = $1', [table]);
                                    tableStats[table] = { estimatedRows: Math.max(0, parseInt(countRes.rows[0]?.estimate || '0')) };

                                    const colsRes = await client.query(
                                        `SELECT
                                            c.column_name,
                                            c.data_type,
                                            EXISTS (
                                                SELECT 1 FROM information_schema.table_constraints tc
                                                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                                                WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'
                                                AND tc.table_schema = c.table_schema
                                            ) as is_primary,
                                            EXISTS (
                                                SELECT 1 FROM information_schema.table_constraints tc
                                                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                                                WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'FOREIGN KEY'
                                                AND tc.table_schema = c.table_schema
                                            ) as is_foreign,
                                            (
                                                SELECT ccu.table_name
                                                FROM information_schema.key_column_usage kcu
                                                JOIN information_schema.table_constraints tc ON tc.constraint_name = kcu.constraint_name
                                                JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
                                                WHERE kcu.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'FOREIGN KEY'
                                                LIMIT 1
                                            ) as references_table,
                                            (
                                                SELECT ccu.column_name
                                                FROM information_schema.key_column_usage kcu
                                                JOIN information_schema.table_constraints tc ON tc.constraint_name = kcu.constraint_name
                                                JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
                                                WHERE kcu.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'FOREIGN KEY'
                                                LIMIT 1
                                            ) as references_column
                                        FROM information_schema.columns c
                                        WHERE c.table_name = $1 AND c.table_schema = 'public'`,
                                        [table]
                                    );
                                    // Fetch indices for Postgres
                                    const indexRes = await client.query('SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1', [table]);
                                    const tableIndices = indexRes.rows;

                                    columns[table] = colsRes.rows.map(r => {
                                        const colIndices = tableIndices
                                            .filter(idx => idx.indexdef.includes(`(${r.column_name})`) || idx.indexdef.includes(`, ${r.column_name})`) || idx.indexdef.includes(`(${r.column_name},`))
                                            .map(idx => idx.indexname);

                                        return {
                                            name: r.column_name,
                                            type: r.data_type,
                                            isPrimary: r.is_primary,
                                            isForeign: r.is_foreign,
                                            referencesTable: r.references_table,
                                            referencesColumn: r.references_column,
                                            indices: colIndices.length > 0 ? colIndices : undefined
                                        };
                                    });

                                    // Fetch samples for distribution calculation
                                    try {
                                        const sampleRes = await client.query(`SELECT * FROM "${table}" LIMIT 10`);
                                        samples.push(...sampleRes.rows.map(r => ({ ...r, _table: table })));
                                    } catch (e) {
                                        console.warn(`Failed to sample table ${table}:`, e);
                                    }
                                }

                                return NextResponse.json({
                                    success: true,
                                    schema: { tables, columns, tableStats },
                                    samples,
                                    executionTimeMs: Date.now() - startTime
                                });
                            } finally {
                                await client.end().catch(() => { });
                            }
                        } else {
                            // @ts-expect-error - Overloaded mysql connection config
                            const connection = await mysql.createConnection(sqlConfig);
                            try {
                                // Fetch tables
                                const [tableRows] = await connection.execute('SHOW TABLES');
                                // @ts-expect-error - Dynamic mysql result
                                const tables = tableRows.map(r => Object.values(r as Record<string, unknown>)[0]);

                                // Fetch columns for each table with PK/FK intelligence and estimated row counts
                                const columns: Record<string, { name: string, type: string, isPrimary?: boolean, isForeign?: boolean, indices?: string[] }[]> = {};
                                const tableStats: Record<string, { estimatedRows: number }> = {};
                                const samples: Record<string, unknown>[] = [];

                                for (const table of tables) {
                                    // Estimated row count for MySQL
                                    const [countRows] = await connection.execute('SELECT TABLE_ROWS as estimate FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
                                    // @ts-expect-error - Dynamic mysql result
                                    tableStats[table] = { estimatedRows: parseInt(countRows[0]?.estimate || '0') };

                                    const [colsRows] = await connection.execute(
                                        `SELECT
                                            c.COLUMN_NAME as name,
                                            c.DATA_TYPE as type,
                                            (c.COLUMN_KEY = 'PRI') as isPrimary,
                                            (
                                                SELECT kcu.REFERENCED_TABLE_NAME
                                                FROM information_schema.KEY_COLUMN_USAGE kcu
                                                WHERE kcu.TABLE_SCHEMA = c.TABLE_SCHEMA AND kcu.TABLE_NAME = c.TABLE_NAME AND kcu.COLUMN_NAME = c.COLUMN_NAME AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                                                LIMIT 1
                                            ) as referencesTable,
                                            (
                                                SELECT kcu.REFERENCED_COLUMN_NAME
                                                FROM information_schema.KEY_COLUMN_USAGE kcu
                                                WHERE kcu.TABLE_SCHEMA = c.TABLE_SCHEMA AND kcu.TABLE_NAME = c.TABLE_NAME AND kcu.COLUMN_NAME = c.COLUMN_NAME AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                                                LIMIT 1
                                            ) as referencesColumn
                                        FROM information_schema.COLUMNS c
                                        WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = ?`,
                                        [table]
                                    );
                                    // Fetch indices for MySQL
                                    const [indexRows] = await connection.execute(`SHOW INDEX FROM \`${table}\``);
                                    const tableIndices = indexRows as Record<string, unknown>[];

                                    columns[table] = (colsRows as Record<string, unknown>[]).map(r_raw => {
                                        const r = r_raw as Record<string, unknown>;
                                        const colIndices = Array.from(new Set(tableIndices
                                            .filter(idx => idx.Column_name === r.name)
                                            .map(idx => String(idx.Key_name))));

                                        return {
                                            name: String(r.name),
                                            type: String(r.type),
                                            isPrimary: !!r.isPrimary,
                                            isForeign: !!r.referencesTable,
                                            referencesTable: r.referencesTable ? String(r.referencesTable) : undefined,
                                            referencesColumn: r.referencesColumn ? String(r.referencesColumn) : undefined,
                                            indices: colIndices.length > 0 ? colIndices : undefined
                                        };
                                    });

                                    // Fetch samples for distribution calculation
                                    try {
                                        const [sampleRows] = await connection.execute(`SELECT * FROM \`${table}\` LIMIT 10`);
                                        samples.push(...(sampleRows as Record<string, unknown>[]).map(r => ({ ...r, _table: table })));
                                    } catch (e) {
                                        console.warn(`Failed to sample table ${table}:`, e);
                                    }
                                }

                                return NextResponse.json({
                                    success: true,
                                    schema: { tables, columns, tableStats },
                                    samples,
                                    executionTimeMs: Date.now() - startTime
                                });
                            } finally {
                                await connection.end().catch(() => { });
                            }
                        }
                    }

                    if (isPostgres) {
                        // Enforce SSL if configured
                        if (storageConfig.ssl && typeof sqlConfig === 'string') {
                            const url = new URL(sqlConfig);
                            url.searchParams.set('sslmode', 'require');
                            sqlConfig = url.toString();
                        } else if (storageConfig.ssl && typeof sqlConfig === 'object' && sqlConfig !== null) {
                            (sqlConfig as Record<string, unknown>).ssl = { rejectUnauthorized: true };
                        }

                        const client = new PgClient(sqlConfig);
                        try {
                            await client.connect();
                            const res = await client.query(query, sqlParams);

                            // Handle multiple result sets
                            if (Array.isArray(res)) {
                                const resultSets = res.map(r => ({
                                    results: Array.isArray(r.rows) ? r.rows.slice(0, MAX_ROWS) : [],
                                    rowCount: Array.isArray(r.rows) ? r.rows.length : 0
                                }));
                                return NextResponse.json({
                                    success: true,
                                    resultSets,
                                    executionTimeMs: Date.now() - startTime
                                });
                            }

                            const rawRows = Array.isArray(res.rows) ? res.rows.slice(0, MAX_ROWS) : [];
                            const rows = rawRows as unknown as Record<string, unknown>[];
                            const optimizationSuggestions: { message: string, severity: 'high' | 'medium' | 'low', score: number, action?: { type: string, table: string, column?: string } }[] = [];
                            let driftResult = undefined;

                            if (query.toUpperCase().startsWith('EXPLAIN')) {
                                // Plan Drift Detection
                                const { detectPlanDrift } = await import('@/lib/gcp/monitoring');
                                driftResult = detectPlanDrift(rows, []);
                                rows.forEach((row, index) => {
                                    const plan = String(row['QUERY PLAN'] || '');
                                    if (plan.includes('Seq Scan')) {
                                        const tableMatch = plan.match(/on (\w+)/);
                                        const table = tableMatch ? tableMatch[1] : 'table';

                                        // Look ahead for Filter with large row count
                                        let filterDetails = '';
                                        let severity: 'high' | 'medium' | 'low' = 'medium';
                                        let score = 60;

                                        const rowsMatch = plan.match(/rows=(\d+)/);
                                        const rowCount = rowsMatch ? parseInt(rowsMatch[1]) : 0;

                                        const nextRow = rows[index + 1];
                                        if (nextRow) {
                                            const nextPlan = String(nextRow['QUERY PLAN'] || '');
                                            if (nextPlan.includes('Filter:')) {
                                                if (rowCount > 1000) {
                                                    filterDetails = ` with Filter on ${rowCount} rows`;
                                                    severity = 'high';
                                                    score = 85;
                                                }
                                            }
                                        }

                                        if (rowCount > 5000) {
                                            severity = 'high';
                                            score = 95;
                                        }

                                        let columnHint = undefined;
                                        if (nextRow) {
                                            const nextPlan = String(nextRow['QUERY PLAN'] || '');
                                            const colMatch = nextPlan.match(/Filter: \((\w+)/);
                                            if (colMatch) columnHint = colMatch[1];
                                        }

                                        optimizationSuggestions.push({
                                            message: `POSTGRES: Full table scan detected on "${table}"${filterDetails}. Consider adding an index for the columns in the FILTER clause to improve performance.`,
                                            severity,
                                            score,
                                            action: columnHint ? { type: 'apply_index', table, column: columnHint } : undefined
                                        });
                                    }
                                });
                            }

                            return NextResponse.json({
                                success: true,
                                results: rows,
                                rowCount: rows.length,
                                optimizationSuggestions: optimizationSuggestions.length > 0 ? optimizationSuggestions : undefined,
                                drift: driftResult?.drifted ? driftResult : undefined,
                                executionTimeMs: Date.now() - startTime
                            });
                        } finally {
                            await client.end().catch(() => { });
                        }
                    } else {
                        // For MySQL, we need to use query instead of execute for multiple statements
                        const mysqlOptions: Record<string, unknown> = {
                            ...(typeof sqlConfig === 'string' ? { uri: sqlConfig } : sqlConfig),
                            multipleStatements: true
                        };

                        if (storageConfig.ssl) {
                            mysqlOptions.ssl = { rejectUnauthorized: true };
                        }

                        const connection = await mysql.createConnection(mysqlOptions);
                        try {
                            const [rows] = await connection.query(query, sqlParams);

                            // MySQL multi-result sets are returned as an array of arrays
                            if (Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0])) {
                                const resultSets = (rows as unknown[][]).filter(r => Array.isArray(r)).map(r => ({
                                    results: r.slice(0, MAX_ROWS),
                                    rowCount: r.length
                                }));
                                return NextResponse.json({
                                    success: true,
                                    resultSets,
                                    executionTimeMs: Date.now() - startTime
                                });
                            }

                            const rawFinalRows = Array.isArray(rows) ? rows.slice(0, MAX_ROWS) : [];
                            const finalRows = rawFinalRows as unknown as Record<string, unknown>[];
                            const optimizationSuggestions: { message: string, severity: 'high' | 'medium' | 'low', score: number, action?: { type: string, table: string, column?: string } }[] = [];
                            let driftResult = undefined;

                            if (query.toUpperCase().startsWith('EXPLAIN')) {
                                // Plan Drift Detection (Simulation using current and some basic rules)
                                const { detectPlanDrift } = await import('@/lib/gcp/monitoring');
                                driftResult = detectPlanDrift(finalRows, []); // In real implementation, pass history
                                finalRows.forEach(row => {
                                    if (row.type === 'ALL') {
                                        optimizationSuggestions.push({
                                            message: `MYSQL: Full table scan (type: ALL) detected on "${row.table}". Consider adding an index to avoid scanning all ${row.rows} rows.`,
                                            severity: (row.rows as number) > 1000 ? 'high' : 'medium',
                                            score: (row.rows as number) > 1000 ? 90 : 70,
                                            action: { type: 'apply_index', table: String(row.table) }
                                        });
                                    }
                                    if (row.possible_keys === null && row.key === null && typeof row.rows === 'number' && row.rows > 100) {
                                        optimizationSuggestions.push({
                                            message: `MYSQL: No possible keys found for table "${row.table}". Performance will degrade as data grows.`,
                                            severity: row.rows > 1000 ? 'high' : 'medium',
                                            score: row.rows > 1000 ? 80 : 60
                                        });
                                    }
                                    const extra = String(row.Extra || '');
                                    if (extra.includes('Using filesort')) {
                                        optimizationSuggestions.push({
                                            message: `MYSQL: Query is using filesort on table "${row.table}". Consider adding an index on the ORDER BY columns.`,
                                            severity: 'medium',
                                            score: 65
                                        });
                                    }
                                    if (extra.includes('Using temporary')) {
                                        optimizationSuggestions.push({
                                            message: `MYSQL: Query is using a temporary table for table "${row.table}". This may indicate a complex JOIN or GROUP BY that could be optimized with indexes.`,
                                            severity: 'medium',
                                            score: 55
                                        });
                                    }
                                });
                            }

                            return NextResponse.json({
                                success: true,
                                results: finalRows,
                                rowCount: finalRows.length,
                                optimizationSuggestions: optimizationSuggestions.length > 0 ? optimizationSuggestions : undefined,
                                drift: driftResult?.drifted ? driftResult : undefined,
                                executionTimeMs: Date.now() - startTime
                            });
                        } finally {
                            await connection.end().catch(() => { });
                        }
                    }
                } else if (storageConfig.type === 'mongodb-atlas') {
                    const client = new MongoClient(connectionString, { serverSelectionTimeoutMS: 10000 });
                    try {
                        await client.connect();
                        const dbName = new URL(connectionString).pathname.split('/')[1] || 'test';
                        const db = client.db(dbName);

                        if (query === 'DISCOVER_SCHEMA') {
                            const collections = await db.listCollections().toArray();
                            const collectionNames = collections.map(c => c.name);

                            // Sample fields from collections (limit to first 5 collections to avoid timeouts)
                            const columns: Record<string, { name: string, type: string }[]> = {};
                            for (const name of collectionNames.slice(0, 5)) {
                                try {
                                    const sample = await db.collection(name).find().limit(5).toArray();
                                    if (sample.length > 0) {
                                        const fields = new Map<string, string>();
                                        sample.forEach(doc => {
                                            Object.entries(doc).forEach(([key, val]) => {
                                                if (!fields.has(key)) {
                                                    fields.set(key, typeof val);
                                                }
                                            });
                                        });
                                        columns[name] = Array.from(fields.entries()).map(([k, t]) => ({ name: k, type: t }));
                                    }
                                } catch (e) {
                                    console.warn(`Failed to sample collection ${name}:`, e);
                                }
                            }

                            return NextResponse.json({
                                success: true,
                                schema: { collections: collectionNames, columns },
                                executionTimeMs: Date.now() - startTime
                            });
                        }

                        let parsedQuery;
                        try {
                            parsedQuery = typeof query === 'string' ? JSON.parse(query) : query;
                        } catch {
                            return NextResponse.json({ success: false, error: 'Invalid MongoDB query format. Expected JSON.' }, { status: 400 });
                        }

                        const { collection, filter = {}, limit = 10 } = parsedQuery;

                        if (!collection) {
                            return NextResponse.json({ success: false, error: 'Collection name is required for MongoDB query' }, { status: 400 });
                        }

                        const results = await db.collection(collection).find(filter).limit(Math.min(limit, MAX_ROWS)).toArray();
                        return NextResponse.json({
                            success: true,
                            results,
                            rowCount: results.length,
                            executionTimeMs: Date.now() - startTime
                        });
                    } catch (e) {
                        return NextResponse.json({
                            success: false,
                            error: `MongoDB Execution Error: ${e instanceof Error ? e.message : 'Unknown error'}`
                        }, { status: 500 });
                    } finally {
                        await client.close().catch(() => { });
                    }
                } else if (storageConfig.type === 'memorystore-redis') {
                    const redis = new Redis(connectionString, { commandTimeout: 10000, connectTimeout: 10000 });
                    try {
                        if (query === 'DISCOVER_SCHEMA') {
                            const info = await redis.info();
                            const keysCount = await redis.dbsize();
                            // Scan for a sample of keys to infer patterns
                            const [, keys] = await redis.scan(0, 'COUNT', 20);

                            return NextResponse.json({
                                success: true,
                                schema: {
                                    info: info.split('\n').filter(line => line.includes('redis_version') || line.includes('used_memory_human')).join(', '),
                                    keysCount,
                                    sampleKeys: keys,
                                    patterns: Array.from(new Set(keys.map(k => k.split(':')[0] + ':*')))
                                },
                                executionTimeMs: Date.now() - startTime
                            });
                        }

                        // Redis query can be a command or a JSON for complex scans
                        let results: unknown;
                        try {
                            if (query.trim().startsWith('{')) {
                                const { command, args = [] } = JSON.parse(query);
                                // @ts-expect-error - Dynamic redis command
                                results = await redis[command](...args);
                            } else {
                                const [cmd, ...args] = query.split(' ');
                                // @ts-expect-error - Dynamic redis command
                                if (typeof redis[cmd.toLowerCase()] === 'function') {
                                    // @ts-expect-error - Dynamic redis command
                                    results = await redis[cmd.toLowerCase()](...args);
                                } else {
                                    return NextResponse.json({ success: false, error: `Unsupported Redis command: ${cmd}` }, { status: 400 });
                                }
                            }
                        } catch (e) {
                            return NextResponse.json({ success: false, error: `Redis Parsing Error: ${e instanceof Error ? e.message : 'Invalid command format'}` }, { status: 400 });
                        }

                        const finalResults = Array.isArray(results) ? results.slice(0, MAX_ROWS) : [results];
                        return NextResponse.json({
                            success: true,
                            results: finalResults,
                            rowCount: finalResults.length,
                            executionTimeMs: Date.now() - startTime
                        });
                    } catch (e) {
                        return NextResponse.json({
                            success: false,
                            error: `Redis Execution Error: ${e instanceof Error ? e.message : 'Unknown error'}`
                        }, { status: 500 });
                    } finally {
                        redis.disconnect();
                    }
                } else if (storageConfig.type === 'firestore') {
                    const db = getDb();

                    if (query === 'DISCOVER_SCHEMA') {
                        const collections = await db.listCollections();
                        const collectionIds = collections.map(c => c.id);

                        // Sample fields from Firestore (first 5 collections)
                        const columns: Record<string, { name: string, type: string }[]> = {};
                        for (const id of collectionIds.slice(0, 5)) {
                            const snapshot = await db.collection(id).limit(5).get();
                            if (!snapshot.empty) {
                                const fields = new Map<string, string>();
                                snapshot.docs.forEach(doc => {
                                    Object.entries(doc.data()).forEach(([key, val]) => {
                                        if (!fields.has(key)) {
                                            fields.set(key, typeof val);
                                        }
                                    });
                                });
                                columns[id] = Array.from(fields.entries()).map(([k, t]) => ({ name: k, type: t }));
                            }
                        }

                        return NextResponse.json({
                            success: true,
                            schema: { collections: collectionIds, columns },
                            executionTimeMs: Date.now() - startTime
                        });
                    }
                    let queryObj: ReturnType<typeof db.collection> | ReturnType<typeof db.collection>['where'];

                    try {
                        let parsedQuery;
                        try {
                            parsedQuery = typeof query === 'string' ? JSON.parse(query) : query;
                        } catch {
                            return NextResponse.json({ success: false, error: 'Invalid Firestore query format. Expected JSON.' }, { status: 400 });
                        }

                        const { collection, limit = 10, where } = parsedQuery;

                        if (!collection) {
                            return NextResponse.json({ success: false, error: 'Collection name is required for Firestore query' }, { status: 400 });
                        }

                        queryObj = db.collection(collection);

                        if (where && Array.isArray(where)) {
                            where.forEach((w: [string, string, unknown]) => {
                                if (w.length === 3) {
                                    // @ts-expect-error - Dynamic filter
                                    queryObj = queryObj.where(w[0], w[1], w[2]);
                                }
                            });
                        }

                        const snapshot = await queryObj.limit(Math.min(limit, MAX_ROWS)).get();
                        const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                        return NextResponse.json({
                            success: true,
                            results,
                            rowCount: results.length,
                            executionTimeMs: Date.now() - startTime,
                        });
                    } catch (e) {
                        return NextResponse.json({
                            success: false,
                            error: `Firestore Execution Error: ${e instanceof Error ? e.message : 'Unknown error'}`
                        }, { status: 500 });
                    }
                }

                return NextResponse.json({ success: false, error: 'Unsupported connector type for Data Lab proxy' }, { status: 400 });
            })();

            // Race query against timeout
            const response = await Promise.race([resultPromise, timeoutPromise]) as NextResponse;
            const executionTimeMs = Date.now() - startTime;

            // Log performance metrics for observability
            const db = getDb();
            const now = new Date();

            // Clone the response to read body without consuming it for the final return
            const responseClone = response.clone();
            const responseDataRaw = await responseClone.json();

            // Only mask if the user is not an owner or if explicitly required for compliance
            const shouldMask = widgetId || access?.role === 'viewer';
            const responseData = shouldMask ? maskData(responseDataRaw) : responseDataRaw;

            // Record execution metrics
            await db.collection(Collections.STORAGE_METRICS).add({
                projectId: id,
                storageId,
                userId: session?.user?.id || 'public',
                type: storageConfig.type,
                executionTimeMs,
                success: response.status === 200,
                isSlow: executionTimeMs > 1000,
                rowCount: (responseData as { rowCount?: number }).rowCount || 0,
                query: query !== 'DISCOVER_SCHEMA' ? query : undefined,
                timestamp: now
            });

            // Record to query history
            if (query !== 'DISCOVER_SCHEMA') {
                await db.collection(Collections.QUERY_HISTORY).add({
                    projectId: id,
                    storageId,
                    userId: session?.user?.id || 'public',
                    query,
                    executionTimeMs,
                    rowCount: (responseData as { rowCount?: number }).rowCount || 0,
                    timestamp: now
                });

                // Record to compliance audit logs
                await db.collection(Collections.DATA_LAB_AUDIT).add({
                    projectId: id,
                    storageId,
                    userId: session?.user?.id || 'public',
                    userEmail: session?.user?.email || 'anonymous',
                    query,
                    executionTimeMs,
                    rowCount: (responseData as { rowCount?: number }).rowCount || 0,
                    success: true,
                    timestamp: now,
                    metadata: {
                        widgetId,
                        storageType: storageConfig.type
                    }
                });
            }

            return NextResponse.json(responseData, { status: response.status });
        } catch (error) {
            const executionTimeMs = Date.now() - startTime;
            if (process.env.MOCK_DB !== 'true') {
                const db = getDb();
                const now = new Date();

                await db.collection(Collections.STORAGE_METRICS).add({
                    projectId: id,
                    storageId,
                    userId: session?.user?.id || 'public',
                    type: storageConfig.type,
                    executionTimeMs,
                    success: false,
                    isSlow: executionTimeMs > 1000,
                    query: query !== 'DISCOVER_SCHEMA' ? query : undefined,
                    error: error instanceof Error ? error.message : 'Unknown connectivity error',
                    timestamp: now
                });

                // Record failed query to history as well
                if (query !== 'DISCOVER_SCHEMA') {
                    await db.collection(Collections.QUERY_HISTORY).add({
                        projectId: id,
                        storageId,
                        userId: session?.user?.id || 'public',
                        query,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        timestamp: now
                    });

                    // Record to compliance audit logs
                    await db.collection(Collections.DATA_LAB_AUDIT).add({
                        projectId: id,
                        storageId,
                        userId: session?.user?.id || 'public',
                        userEmail: session?.user?.email || 'anonymous',
                        query,
                        executionTimeMs,
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        timestamp: now,
                        metadata: {
                            widgetId,
                            storageType: storageConfig.type
                        }
                    });
                }
            }

            return NextResponse.json({
                success: false,
                error: `Connectivity Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                details: 'If this error persists, verify your network configuration and database credentials.'
            }, { status: 503 });
        }

    } catch (error) {
        console.error('Data Lab execution error:', error);
        return NextResponse.json({ success: false, error: 'Failed to execute query' }, { status: 500 });
    }
}
