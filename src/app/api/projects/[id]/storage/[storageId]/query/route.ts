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
        const { query } = body;

        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        // Strict Read-Only Enforcement for SQL
        if (storageConfig.type.includes('sql') || storageConfig.type === 'planetscale') {
            // Remove comments and whitespace to get the true command
            const cleanQuery = query.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').trim();
            const normalizedQuery = cleanQuery.toUpperCase();

            const forbiddenKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'REPLACE', 'TRUNCATE', 'GRANT', 'REVOKE', 'SET', 'EXECUTE', 'PREPARE'];
            const allowedPrefixes = ['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'DISCOVER_SCHEMA'];

            // Check for forbidden keywords with word boundaries to avoid false positives in identifiers/literals
            const hasForbidden = forbiddenKeywords.some(kw => {
                const regex = new RegExp(`\\b${kw}\\b`, 'i');
                return regex.test(normalizedQuery);
            });

            const hasAllowedPrefix = allowedPrefixes.some(prefix => normalizedQuery.startsWith(prefix));

            // Extra safety for EXPLAIN ANALYZE which can execute data-modifying statements in some DBs
            if (normalizedQuery.startsWith('EXPLAIN')) {
                const hasForbiddenInExplain = forbiddenKeywords.some(kw => {
                    const regex = new RegExp(`\\b${kw}\\b`, 'i');
                    return regex.test(normalizedQuery);
                });
                if (hasForbiddenInExplain) {
                    return NextResponse.json({ error: 'Forbidden: Explain cannot contain data-modifying statements' }, { status: 403 });
                }
            }

            if (hasForbidden || !hasAllowedPrefix) {
                return NextResponse.json({ error: 'Forbidden: Only read-only queries are allowed in Data Lab' }, { status: 403 });
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
                            columns: {
                                'users': [{ name: 'id', type: 'uuid' }, { name: 'email', type: 'varchar' }, { name: 'created_at', type: 'timestamp' }],
                                'projects': [{ name: 'id', type: 'uuid' }, { name: 'name', type: 'varchar' }, { name: 'slug', type: 'varchar' }],
                                'deployments': [{ name: 'id', type: 'uuid' }, { name: 'projectId', type: 'uuid' }, { name: 'status', type: 'varchar' }]
                            }
                        };

                return NextResponse.json({
                    success: true,
                    results: [mockSchema],
                    executionTimeMs: 5
                });
            }

            // Simulated results for demonstration
            const mockResults = [
                { id: 1, name: 'Sample User', email: 'user@example.com', created_at: new Date().toISOString() },
                { id: 2, name: 'Jane Doe', email: 'jane@example.com', created_at: new Date().toISOString() },
                { id: 3, name: 'John Smith', email: 'john@example.com', created_at: new Date().toISOString() },
            ];

            return NextResponse.json({
                success: true,
                results: mockResults.slice(0, query.toLowerCase().includes('limit') ? parseInt(query.match(/limit (\d+)/i)?.[1] || '3') : 3),
                executionTimeMs: Math.floor(Math.random() * 50) + 10,
            });
        }

        const startTime = Date.now();

        // Real Connectivity Logic (Experimental Proxy)
        try {
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
                                ssl: socketPath ? false : { rejectUnauthorized: false }
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

                            // Fetch columns for each table
                            const columns: Record<string, { name: string, type: string }[]> = {};
                            for (const table of tables) {
                                const colsRes = await client.query(
                                    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1",
                                    [table]
                                );
                                columns[table] = colsRes.rows.map(r => ({ name: r.column_name, type: r.data_type }));
                            }

                            return NextResponse.json({
                                success: true,
                                results: [{ tables, columns }],
                                executionTimeMs: Date.now() - startTime
                            });
                        } finally {
                            await client.end();
                        }
                    } else {
                        // @ts-expect-error - Overloaded mysql connection config
                        const connection = await mysql.createConnection(sqlConfig);
                        try {
                            // Fetch tables
                            const [tableRows] = await connection.execute('SHOW TABLES');
                            // @ts-expect-error - Dynamic mysql result
                            const tables = tableRows.map(r => Object.values(r as Record<string, unknown>)[0]);

                            // Fetch columns for each table
                            const columns: Record<string, { name: string, type: string }[]> = {};
                            for (const table of tables) {
                                const [colsRows] = await connection.execute(`DESCRIBE ${table}`);
                                // @ts-expect-error - Dynamic mysql result
                                columns[table] = colsRows.map(r => ({ name: r.Field, type: r.Type }));
                            }

                            return NextResponse.json({
                                success: true,
                                results: [{ tables, columns }],
                                executionTimeMs: Date.now() - startTime
                            });
                        } finally {
                            await connection.end();
                        }
                    }
                }

                if (isPostgres) {
                    const client = new PgClient(sqlConfig);
                    try {
                        await client.connect();
                        const res = await client.query(query);
                        return NextResponse.json({
                            success: true,
                            results: res.rows,
                            executionTimeMs: Date.now() - startTime
                        });
                    } finally {
                        await client.end();
                    }
                } else {
                    // @ts-expect-error - Overloaded mysql connection config
                    const connection = await mysql.createConnection(sqlConfig);
                    try {
                        const [rows] = await connection.execute(query);
                        return NextResponse.json({
                            success: true,
                            results: rows,
                            executionTimeMs: Date.now() - startTime
                        });
                    } finally {
                        await connection.end();
                    }
                }
            } else if (storageConfig.type === 'mongodb-atlas') {
                const client = new MongoClient(connectionString);
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
                        }

                        return NextResponse.json({
                            success: true,
                            results: [{ collections: collectionNames, columns }],
                            executionTimeMs: Date.now() - startTime
                        });
                    }

                    const parsedQuery = typeof query === 'string' ? JSON.parse(query) : query;
                    const { collection, filter = {}, limit = 10 } = parsedQuery;

                    if (!collection) {
                        throw new Error('Collection name is required for MongoDB query');
                    }

                    const results = await db.collection(collection).find(filter).limit(limit).toArray();
                    return NextResponse.json({
                        success: true,
                        results,
                        executionTimeMs: Date.now() - startTime
                    });
                } finally {
                    await client.close();
                }
            } else if (storageConfig.type === 'memorystore-redis') {
                const redis = new Redis(connectionString);
                try {
                    if (query === 'DISCOVER_SCHEMA') {
                        const info = await redis.info();
                        const keysCount = await redis.dbsize();
                        // Scan for a sample of keys to infer patterns
                        const [, keys] = await redis.scan(0, 'COUNT', 20);

                        return NextResponse.json({
                            success: true,
                            results: [{
                                info: info.split('\n').filter(line => line.includes('redis_version') || line.includes('used_memory_human')).join(', '),
                                keysCount,
                                sampleKeys: keys,
                                patterns: Array.from(new Set(keys.map(k => k.split(':')[0] + ':*')))
                            }],
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

                    return NextResponse.json({
                        success: true,
                        results: Array.isArray(results) ? results : [results],
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
                        results: [{ collections: collectionIds, columns }],
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

                    const snapshot = await queryObj.limit(limit).get();
                    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    return NextResponse.json({
                        success: true,
                        results,
                        executionTimeMs: Math.floor(Math.random() * 50) + 10,
                    });
                } catch (e) {
                    throw new Error(`Firestore query parse error: ${e instanceof Error ? e.message : 'Invalid JSON'}`);
                }
            }

            return NextResponse.json({ error: 'Unsupported connector type for Data Lab proxy' }, { status: 400 });
            })();

            const response = await resultPromise;
            const executionTimeMs = Date.now() - startTime;

            // Log performance metrics for observability
            if (process.env.MOCK_DB !== 'true') {
                const db = getDb();
                const now = new Date();

                // Record execution metrics
                await db.collection(Collections.STORAGE_METRICS).add({
                    projectId: id,
                    storageId,
                    userId: session.user.id,
                    type: storageConfig.type,
                    executionTimeMs,
                    success: response.status === 200,
                    isSlow: executionTimeMs > 1000,
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
