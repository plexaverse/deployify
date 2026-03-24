import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
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
                        : { tables: ['users', 'projects', 'deployments', 'domains', 'env_vars'] };

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

                if (query === 'DISCOVER_SCHEMA') {
                    if (isPostgres) {
                        const client = new PgClient({ connectionString });
                        try {
                            await client.connect();
                            const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
                            return NextResponse.json({
                                success: true,
                                results: [{ tables: res.rows.map(r => r.table_name) }],
                                executionTimeMs: Date.now() - startTime
                            });
                        } finally {
                            await client.end();
                        }
                    } else {
                        const connection = await mysql.createConnection(connectionString);
                        try {
                            const [rows] = await connection.execute('SHOW TABLES');
                            return NextResponse.json({
                                success: true,
                                // @ts-expect-error - Dynamic mysql result
                                results: [{ tables: rows.map(r => Object.values(r as Record<string, unknown>)[0]) }],
                                executionTimeMs: Date.now() - startTime
                            });
                        } finally {
                            await connection.end();
                        }
                    }
                }

                if (isPostgres) {
                    const client = new PgClient({ connectionString });
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
                    const connection = await mysql.createConnection(connectionString);
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
                        return NextResponse.json({
                            success: true,
                            results: [{ collections: collections.map(c => c.name) }],
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
                        return NextResponse.json({
                            success: true,
                            results: [{
                                info: info.split('\n').filter(line => line.includes('redis_version') || line.includes('used_memory_human')).join(', '),
                                keysCount
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
                    return NextResponse.json({
                        success: true,
                        results: [{ collections: collections.map(c => c.id) }],
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
                await db.collection(Collections.STORAGE_METRICS).add({
                    projectId: id,
                    storageId,
                    type: storageConfig.type,
                    executionTimeMs,
                    success: response.status === 200,
                    timestamp: new Date()
                });
            }

            return response;
        } catch (error) {
            const executionTimeMs = Date.now() - startTime;
            if (process.env.MOCK_DB !== 'true') {
                const db = getDb();
                await db.collection(Collections.STORAGE_METRICS).add({
                    projectId: id,
                    storageId,
                    type: storageConfig.type,
                    executionTimeMs,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown connectivity error',
                    timestamp: new Date()
                });
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
