import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import type { StorageConfig } from '@/types';
import { Client as PgClient, ClientConfig as PgClientConfig } from 'pg';
import mysql, { ConnectionOptions as MysqlConnectionOptions } from 'mysql2/promise';

/**
 * POST - Apply an index to a table (One-Click SQL Optimization)
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const { table, column, indexName, customSql } = await request.json();

        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Authorization
        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        if (access.role === 'viewer') {
            return NextResponse.json({
                success: false,
                error: 'Forbidden: Insufficient permissions to modify schema'
            }, { status: 403 });
        }

        const storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        if (!storageConfig) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const isPostgres = storageConfig.type === 'cloud-sql-postgres' || storageConfig.type === 'supabase';
        const isMysql = storageConfig.type === 'cloud-sql-mysql' || storageConfig.type === 'planetscale';

        if (!isPostgres && !isMysql) {
            return NextResponse.json({ success: false, error: 'Index application is only supported for SQL databases' }, { status: 400 });
        }

        // 2. Construct SQL
        let sql = '';
        if (customSql) {
            sql = customSql;
        } else {
            if (!table || !column) {
                return NextResponse.json({ success: false, error: 'Table and column are required' }, { status: 400 });
            }
            const name = indexName || `idx_${table}_${column}_${Math.floor(Math.random() * 1000)}`;
            if (isPostgres) {
                // Postgres: Use CONCURRENTLY to avoid locking the table
                sql = `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON "${table}" ("${column}")`;
            } else {
                // MySQL
                sql = `CREATE INDEX \`${name}\` ON \`${table}\` (\`${column}\`)`;
            }
        }

        if (process.env.MOCK_DB === 'true') {
            return NextResponse.json({
                success: true,
                message: 'Index applied successfully (MOCK)',
                sql,
                executionTimeMs: 120
            });
        }

        // 3. Get credentials
        let connectionString = '';
        if (storageConfig.connectionStringSecretId) {
            connectionString = await getSecretValue(storageConfig.connectionStringSecretId);
        }

        if (!connectionString) {
            return NextResponse.json({ success: false, error: 'Connection string not configured' }, { status: 400 });
        }

        const startTime = Date.now();
        const isIamAuth = connectionString.includes('enable_iam_auth=true');

        try {
            if (isPostgres) {
                let pgConfig: string | PgClientConfig = connectionString;
                if (isIamAuth) {
                    const url = new URL(connectionString);
                    const accessToken = await getGcpAccessToken();
                    const socketPath = url.searchParams.get('host');
                    pgConfig = {
                        host: socketPath || url.hostname,
                        port: url.port ? parseInt(url.port, 10) : 5432,
                        user: url.username || 'deployify-sa',
                        password: accessToken,
                        database: url.pathname.split('/')[1] || 'postgres',
                        ssl: socketPath ? false : (storageConfig.ssl ? { rejectUnauthorized: true } : { rejectUnauthorized: false })
                    };
                }

                const client = new PgClient(pgConfig);
                await client.connect();
                try {
                    await client.query(sql);
                } finally {
                    await client.end().catch(() => {});
                }
            } else {
                let mysqlConfig: string | MysqlConnectionOptions = connectionString;
                if (isIamAuth) {
                    const url = new URL(connectionString);
                    const accessToken = await getGcpAccessToken();
                    const socketPath = url.searchParams.get('host');
                    mysqlConfig = {
                        host: url.hostname,
                        port: url.port ? parseInt(url.port, 10) : 3306,
                        socketPath: socketPath || undefined,
                        user: url.username || 'deployify-sa',
                        password: accessToken,
                        database: url.pathname.split('/')[1] || 'mysql',
                        ssl: socketPath ? undefined : (storageConfig.ssl ? { rejectUnauthorized: true } : { rejectUnauthorized: false })
                    };
                }

                const connection = typeof mysqlConfig === 'string'
                    ? await mysql.createConnection(mysqlConfig)
                    : await mysql.createConnection(mysqlConfig);
                try {
                    await connection.query(sql);
                } finally {
                    await connection.end().catch(() => {});
                }
            }

            return NextResponse.json({
                success: true,
                message: 'Index applied successfully',
                sql,
                executionTimeMs: Date.now() - startTime
            });
        } catch (error) {
            console.error('Failed to apply index:', error);
            return NextResponse.json({
                success: false,
                error: `SQL Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                sql
            }, { status: 500 });
        }
    } catch (error) {
        console.error('Apply index API error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
