import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import { Migration, StorageType } from '@/types';

/**
 * List applied migrations from a database by discovering common migration tables
 */
export async function listMigrations(
    connectionString: string,
    storageType: StorageType
): Promise<Migration[]> {
    if (process.env.MOCK_DB === 'true') {
        return [
            { id: '1', name: '20240101000000_init', appliedAt: new Date(Date.now() - 86400000 * 10).toISOString(), status: 'SUCCESS', provider: 'prisma' },
            { id: '2', name: '20240105000000_add_users', appliedAt: new Date(Date.now() - 86400000 * 5).toISOString(), status: 'SUCCESS', provider: 'prisma' },
            { id: '3', name: '20240410000000_fail_migration', appliedAt: new Date(Date.now() - 3600000).toISOString(), status: 'FAILED', provider: 'prisma' }
        ];
    }

    const isPostgres = storageType.includes('postgres') || storageType === 'supabase';
    const isMysql = storageType.includes('mysql') || storageType === 'planetscale';

    if (isPostgres) {
        const client = new PgClient({ connectionString });
        try {
            await client.connect();

            // Check for Prisma
            const prismaRes = await client.query("SELECT * FROM information_schema.tables WHERE table_name = '_prisma_migrations' AND table_schema = 'public'");
            if (prismaRes.rowCount && prismaRes.rowCount > 0) {
                const res = await client.query("SELECT id, migration_name, finished_at, checksum FROM _prisma_migrations ORDER BY started_at DESC");
                return res.rows.map(r => ({
                    id: r.id,
                    name: r.migration_name,
                    appliedAt: r.finished_at ? new Date(r.finished_at).toISOString() : new Date().toISOString(),
                    status: r.finished_at ? 'SUCCESS' : 'FAILED',
                    checksum: r.checksum,
                    provider: 'prisma' as const
                }));
            }

            // Check for Drizzle
            const drizzleRes = await client.query("SELECT * FROM information_schema.tables WHERE table_name = 'drizzle_migrations' AND table_schema = 'public'");
            if (drizzleRes.rowCount && drizzleRes.rowCount > 0) {
                const res = await client.query("SELECT id, hash, created_at FROM drizzle_migrations ORDER BY created_at DESC");
                return res.rows.map(r => ({
                    id: String(r.id),
                    name: `migration_${r.id}`,
                    appliedAt: new Date(Number(r.created_at)).toISOString(),
                    status: 'SUCCESS' as const,
                    checksum: r.hash,
                    provider: 'drizzle' as const
                }));
            }

            return [];
        } finally {
            await client.end().catch(() => {});
        }
    } else if (isMysql) {
        const connection = await mysql.createConnection(connectionString);
        try {
            // Check for Prisma
            const [prismaTables] = await connection.execute("SELECT table_name FROM information_schema.tables WHERE table_name = '_prisma_migrations' AND table_schema = DATABASE()");
            if (Array.isArray(prismaTables) && prismaTables.length > 0) {
                const [res] = await connection.execute("SELECT id, migration_name, finished_at, checksum FROM _prisma_migrations ORDER BY started_at DESC");
                return (res as Array<{ id: string, migration_name: string, finished_at: string, checksum: string }>).map(r => ({
                    id: r.id,
                    name: r.migration_name,
                    appliedAt: r.finished_at ? new Date(r.finished_at).toISOString() : new Date().toISOString(),
                    status: (r.finished_at ? 'SUCCESS' : 'FAILED') as 'SUCCESS' | 'FAILED',
                    checksum: r.checksum,
                    provider: 'prisma' as const
                }));
            }

            // Check for Drizzle
            const [drizzleTables] = await connection.execute("SELECT table_name FROM information_schema.tables WHERE table_name = 'drizzle_migrations' AND table_schema = DATABASE()");
            if (Array.isArray(drizzleTables) && drizzleTables.length > 0) {
                const [res] = await connection.execute("SELECT id, hash, created_at FROM drizzle_migrations ORDER BY created_at DESC");
                return (res as Array<{ id: number, hash: string, created_at: string | number }>).map(r => ({
                    id: String(r.id),
                    name: `migration_${r.id}`,
                    appliedAt: new Date(Number(r.created_at)).toISOString(),
                    status: 'SUCCESS' as const,
                    checksum: r.hash,
                    provider: 'drizzle' as const
                }));
            }

            return [];
        } finally {
            await connection.end().catch(() => {});
        }
    }

    return [];
}

/**
 * Simulate running a migration (In a real system, this would trigger a CI/CD job)
 */
export async function runMigration(
    instanceName: string,
    command: string
): Promise<{ operationName: string }> {
    if (process.env.MOCK_DB === 'true') {
        return { operationName: `projects/mock/operations/migrate-${instanceName}-${Date.now()}` };
    }

    // In a real implementation, we might use Cloud Build to run the migration container
    // For this evolution, we provide the structure for the operation.
    return { operationName: `projects/real/operations/migrate-${instanceName}` };
}
