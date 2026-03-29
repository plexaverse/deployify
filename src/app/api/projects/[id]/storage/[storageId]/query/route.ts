import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { getDb, Collections } from '@/lib/firebase';
import type { StorageConfig } from '@/types';
import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';

const MAX_ROWS = 500;

/**
 * Experimental read-only query browser proxy
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storageConfig = project.storageConfigs?.find((s: StorageConfig) => s.id === storageId);

        if (!storageConfig) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        const body = await request.json();
        let { query } = body;
        const { variables = {} } = body;

        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
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
                        return NextResponse.json({ error: 'Forbidden: This query contains data-modifying statements' }, { status: 403 });
                    }
                }

                if (hasForbidden || !hasAllowedPrefix) {
                    return NextResponse.json({ error: 'Forbidden: Only read-only queries are allowed in Data Lab' }, { status: 403 });
                }
            }
        }

        // 1. Get credentials securely
        let connectionString = '';
        if (storageConfig.connectionStringSecretId) {
            connectionString = await getSecretValue(storageConfig.connectionStringSecretId);
        }

        if (!connectionString && process.env.MOCK_DB !== 'true') {
            return NextResponse.json({ error: 'Connection string not configured' }, { status: 400 });
        }

        // 2. Execute Query (Mocked or Real)
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
                                'users': [{ name: 'id', type: 'uuid', isPrimary: true }, { name: 'email', type: 'varchar' }, { name: 'created_at', type: 'timestamp' }],
                                'projects': [{ name: 'id', type: 'uuid', isPrimary: true }, { name: 'userId', type: 'uuid', isForeign: true }, { name: 'name', type: 'varchar' }, { name: 'slug', type: 'varchar' }],
                                'deployments': [{ name: 'id', type: 'uuid', isPrimary: true }, { name: 'projectId', type: 'uuid', isForeign: true }, { name: 'status', type: 'varchar' }]
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
                        { id: 1, select_type: 'SIMPLE', table: 'users', partitions: null, type: 'ALL', possible_keys: null, key: null, key_len: null, ref: null, rows: 1250, filtered: 10.00, Extra: 'Using where' }
                    ];

                const optimizationSuggestions: string[] = [];
                if (isPostgres) {
                    optimizationSuggestions.push('POSTGRES: Full table scan detected on "users". Consider adding an index for the columns in the FILTER clause to improve performance.');
                } else {
                    optimizationSuggestions.push('MYSQL: Full table scan (type: ALL) detected on "users". Consider adding an index to avoid scanning all 1250 rows.');
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

        const startTime = Date.now();

        // Real Connectivity Logic (Experimental Proxy)
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Query execution timeout after 25s')), 25000)
            );

            const resultPromise = (async () => {
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
                                ssl: socketPath ? false : { rejectUnauthorized: false }
                            };
                        } else {
                            sqlConfig = {
                                host: url.hostname,
                                port: url.port ? parseInt(url.port, 10) : 3306,
                                socketPath: socketPath || undefined,
                                user: url.username || 'deployify-sa',
                                password: accessToken,
                                database: url.pathname.split('/')[1] || 'mysql',
                                ssl: socketPath ? false : { rejectUnauthorized: false },
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
                            const columns: Record<string, { name: string, type: string, isPrimary?: boolean, isForeign?: boolean }[]> = {};
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
                                columns[table] = colsRes.rows.map(r => ({
                                    name: r.column_name,
                                    type: r.data_type,
                                    isPrimary: r.is_primary,
                                    isForeign: r.is_foreign,
                                    referencesTable: r.references_table,
                                    referencesColumn: r.references_column
                                }));

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
                            await client.end().catch(() => {});
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
                            const columns: Record<string, { name: string, type: string, isPrimary?: boolean, isForeign?: boolean }[]> = {};
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
                                // @ts-expect-error - Dynamic mysql result
                                columns[table] = colsRows.map(r => ({
                                    name: r.name,
                                    type: r.type,
                                    isPrimary: !!r.isPrimary,
                                    isForeign: !!r.referencesTable,
                                    referencesTable: r.referencesTable,
                                    referencesColumn: r.referencesColumn
                                }));

                                // Fetch samples for distribution calculation
                                try {
                                    const [sampleRows] = await connection.execute(`SELECT * FROM \`${table}\` LIMIT 10`);
                                    // @ts-expect-error - Dynamic mysql result
                                    samples.push(...sampleRows.map(r => ({ ...r, _table: table })));
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
                            await connection.end().catch(() => {});
                        }
                    }
                }

                if (isPostgres) {
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
                        const optimizationSuggestions: string[] = [];

                        if (query.toUpperCase().startsWith('EXPLAIN')) {
                            rows.forEach(row => {
                                const plan = String(row['QUERY PLAN'] || '');
                                if (plan.includes('Seq Scan')) {
                                    const tableMatch = plan.match(/on (\w+)/);
                                    const table = tableMatch ? tableMatch[1] : 'table';
                                    optimizationSuggestions.push(`POSTGRES: Full table scan detected on "${table}". Consider adding an index for the columns in the FILTER clause to improve performance.`);
                                }
                            });
                        }

                        return NextResponse.json({
                            success: true,
                            results: rows,
                            rowCount: rows.length,
                            optimizationSuggestions: optimizationSuggestions.length > 0 ? optimizationSuggestions : undefined,
                            executionTimeMs: Date.now() - startTime
                        });
                    } finally {
                        await client.end().catch(() => {});
                    }
                } else {
                    // For MySQL, we need to use query instead of execute for multiple statements
                    const connection = await mysql.createConnection({
                        ...(typeof sqlConfig === 'string' ? { uri: sqlConfig } : sqlConfig),
                        multipleStatements: true
                    });
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
                        const optimizationSuggestions: string[] = [];

                        if (query.toUpperCase().startsWith('EXPLAIN')) {
                            finalRows.forEach(row => {
                                if (row.type === 'ALL') {
                                    optimizationSuggestions.push(`MYSQL: Full table scan (type: ALL) detected on "${row.table}". Consider adding an index to avoid scanning all ${row.rows} rows.`);
                                }
                                if (row.possible_keys === null && row.key === null && typeof row.rows === 'number' && row.rows > 100) {
                                    optimizationSuggestions.push(`MYSQL: No possible keys found for table "${row.table}". Performance will degrade as data grows.`);
                                }
                            });
                        }

                        return NextResponse.json({
                            success: true,
                            results: finalRows,
                            rowCount: finalRows.length,
                            optimizationSuggestions: optimizationSuggestions.length > 0 ? optimizationSuggestions : undefined,
                            executionTimeMs: Date.now() - startTime
                        });
                    } finally {
                        await connection.end().catch(() => {});
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

                    const parsedQuery = typeof query === 'string' ? JSON.parse(query) : query;
                    const { collection, filter = {}, limit = 10 } = parsedQuery;

                    if (!collection) {
                        throw new Error('Collection name is required for MongoDB query');
                    }

                    const results = await db.collection(collection).find(filter).limit(Math.min(limit, MAX_ROWS)).toArray();
                    return NextResponse.json({
                        success: true,
                        results,
                        rowCount: results.length,
                        executionTimeMs: Date.now() - startTime
                    });
                } finally {
                    await client.close().catch(() => {});
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
                            throw new Error(`Unsupported Redis command: ${cmd}`);
                        }
                    }

                    const finalResults = Array.isArray(results) ? results.slice(0, MAX_ROWS) : [results];
                    return NextResponse.json({
                        success: true,
                        results: finalResults,
                        rowCount: finalResults.length,
                        executionTimeMs: Date.now() - startTime
                    });
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
                    const parsedQuery = typeof query === 'string' ? JSON.parse(query) : query;
                    const { collection, limit = 10, where } = parsedQuery;

                    if (!collection) {
                        throw new Error('Collection name is required for Firestore query');
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
                    throw new Error(`Firestore query parse error: ${e instanceof Error ? e.message : 'Invalid JSON'}`);
                }
            }

            return NextResponse.json({ error: 'Unsupported connector type for Data Lab proxy' }, { status: 400 });
            })();

            // Race query against timeout
            const response = await Promise.race([resultPromise, timeoutPromise]) as NextResponse;
            const executionTimeMs = Date.now() - startTime;

            // Log performance metrics for observability
            if (process.env.MOCK_DB !== 'true') {
                const db = getDb();
                const now = new Date();

                // Clone the response to read body without consuming it for the final return
                const responseClone = response.clone();
                const responseData = await responseClone.json();

                // Record execution metrics
                await db.collection(Collections.STORAGE_METRICS).add({
                    projectId: id,
                    storageId,
                    userId: session.user.id,
                    type: storageConfig.type,
                    executionTimeMs,
                    success: response.status === 200,
                    isSlow: executionTimeMs > 1000,
                    rowCount: responseData.rowCount || 0,
                    query: query !== 'DISCOVER_SCHEMA' ? query : undefined,
                    timestamp: now
                });

                // Record to query history
                if (query !== 'DISCOVER_SCHEMA') {
                    await db.collection(Collections.QUERY_HISTORY).add({
                        projectId: id,
                        storageId,
                        userId: session.user.id,
                        query,
                        executionTimeMs,
                        rowCount: responseData.rowCount || 0,
                        timestamp: now
                    });
                }
            }

            return response;
        } catch (error) {
            const executionTimeMs = Date.now() - startTime;
            if (process.env.MOCK_DB !== 'true') {
                const db = getDb();
                const now = new Date();

                await db.collection(Collections.STORAGE_METRICS).add({
                    projectId: id,
                    storageId,
                    userId: session.user.id,
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
                        userId: session.user.id,
                        query,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        timestamp: now
                    });
                }
            }

            return NextResponse.json({
                error: `Connectivity Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                details: 'This feature is in experimental rollout and requires internal network clearance.'
            }, { status: 503 });
        }

    } catch (error) {
        console.error('Data Lab execution error:', error);
        return NextResponse.json({ error: 'Failed to execute query' }, { status: 500 });
    }
}
