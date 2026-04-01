import { getRepoContents } from '@/lib/github';
import { getSecretValue } from '@/lib/gcp/secrets';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import type { Project, StorageConfig } from '@/types';

export interface Migration {
    id: string;
    name: string;
    status: 'applied' | 'pending';
    appliedAt?: Date;
}

export interface MigrationDiscovery {
    type: 'prisma' | 'drizzle' | 'unknown';
    migrations: Migration[];
}

/**
 * Discover migrations from repository and database
 */
export async function discoverMigrations(
    project: Project,
    storage: StorageConfig
): Promise<MigrationDiscovery> {
    const accessToken = project.githubToken;
    if (!accessToken) {
        return { type: 'unknown', migrations: [] };
    }

    const [owner, repo] = project.repoFullName.split('/');
    const rootDir = project.rootDirectory || '';

    // 1. Detect Migration Type
    let type: 'prisma' | 'drizzle' | 'unknown' = 'unknown';
    let localMigrations: string[] = [];

    const rootContents = await getRepoContents(accessToken, owner, repo, rootDir);

    // Check for Prisma
    const hasPrismaDir = rootContents.some(item => item.name === 'prisma' && item.type === 'dir');
    if (hasPrismaDir) {
        const prismaDir = rootDir ? `${rootDir}/prisma` : 'prisma';
        const prismaContents = await getRepoContents(accessToken, owner, repo, prismaDir);
        if (prismaContents.some(item => item.name === 'migrations' && item.type === 'dir')) {
            type = 'prisma';
            const migrationsDir = `${prismaDir}/migrations`;
            const migrationItems = await getRepoContents(accessToken, owner, repo, migrationsDir);
            localMigrations = migrationItems
                .filter(item => item.type === 'dir' && /^\d+_/.test(item.name))
                .map(item => item.name)
                .sort();
        }
    }

    // Check for Drizzle (if not Prisma)
    if (type === 'unknown') {
        const hasDrizzleConfig = rootContents.some(item => item.name.startsWith('drizzle.config'));
        const hasDrizzleDir = rootContents.some(item => (item.name === 'drizzle' || item.name === 'migrations') && item.type === 'dir');

        if (hasDrizzleConfig || hasDrizzleDir) {
            type = 'drizzle';
            const drizzleDir = rootContents.find(item => (item.name === 'drizzle' || item.name === 'migrations') && item.type === 'dir')?.name || 'drizzle';
            const migrationPath = rootDir ? `${rootDir}/${drizzleDir}` : drizzleDir;
            const drizzleContents = await getRepoContents(accessToken, owner, repo, migrationPath);
            localMigrations = drizzleContents
                .filter(item => item.name.endsWith('.sql'))
                .map(item => item.name.replace('.sql', ''))
                .sort();
        }
    }

    if (type === 'unknown' || !storage.type.includes('sql') && storage.type !== 'planetscale') {
        return { type, migrations: [] };
    }

    // 2. Fetch Applied Migrations from DB
    const appliedMigrations = new Map<string, Date>();

    if (process.env.MOCK_DB === 'true') {
        // Mock data for local testing
        if (localMigrations.length > 0) {
            localMigrations.slice(0, Math.max(1, localMigrations.length - 1)).forEach(m => {
                appliedMigrations.set(m, new Date(Date.now() - 86400000));
            });
        }
    } else {
        try {
            const connectionString = await getSecretValue(storage.connectionStringSecretId || '');
            if (connectionString) {
                const isPostgres = storage.type === 'cloud-sql-postgres' || storage.type === 'supabase';
                const isIamAuth = connectionString.includes('enable_iam_auth=true');

                let sqlConfig: string | Record<string, unknown> = connectionString;
                if (isIamAuth) {
                    const url = new URL(connectionString);
                    const gcpToken = await getGcpAccessToken();
                    const socketPath = url.searchParams.get('host');

                    if (isPostgres) {
                        sqlConfig = {
                            host: socketPath || url.hostname,
                            user: url.username || 'deployify-sa',
                            password: gcpToken,
                            database: url.pathname.split('/')[1] || 'postgres',
                            ssl: socketPath ? false : { rejectUnauthorized: false }
                        };
                    } else {
                        sqlConfig = {
                            host: url.hostname,
                            socketPath: socketPath || undefined,
                            user: url.username || 'deployify-sa',
                            password: gcpToken,
                            database: url.pathname.split('/')[1] || 'mysql',
                            ssl: socketPath ? false : { rejectUnauthorized: false }
                        };
                    }
                }

                if (isPostgres) {
                    const client = new PgClient(sqlConfig);
                    await client.connect();
                    try {
                        const tableName = type === 'prisma' ? '_prisma_migrations' : '__drizzle_migrations';
                        const res = await client.query(`SELECT migration_name, finished_at FROM "${tableName}" WHERE finished_at IS NOT NULL`);
                        res.rows.forEach(row => {
                            appliedMigrations.set(row.migration_name, row.finished_at);
                        });
                    } catch (e) {
                        console.warn('Failed to fetch migrations from Postgres:', e);
                    } finally {
                        await client.end();
                    }
                } else {
                    // @ts-expect-error - Overloaded mysql connection config
                    const connection = await mysql.createConnection(sqlConfig);
                    try {
                        const tableName = type === 'prisma' ? '_prisma_migrations' : '__drizzle_migrations';
                        const [rows] = await connection.execute(`SELECT migration_name, finished_at FROM \`${tableName}\` WHERE finished_at IS NOT NULL`);
                        (rows as Record<string, unknown>[]).forEach((row) => {
                            appliedMigrations.set(String(row.migration_name), row.finished_at as Date);
                        });
                    } catch (e) {
                        console.warn('Failed to fetch migrations from MySQL:', e);
                    } finally {
                        await connection.end();
                    }
                }
            }
        } catch (error) {
            console.error('Migration discovery database error:', error);
        }
    }

    // 3. Combine Results
    const migrations: Migration[] = localMigrations.map(name => ({
        id: name,
        name,
        status: appliedMigrations.has(name) ? 'applied' : 'pending',
        appliedAt: appliedMigrations.get(name)
    }));

    return { type, migrations };
}
