import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import { Migration, StorageType } from '@/types';
import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

const CLOUD_BUILD_API = 'https://cloudbuild.googleapis.com/v1';

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
 * Trigger a migration execution using GCP Cloud Build
 */
export async function runMigration(
    projectId: string,
    repoFullName: string,
    commitSha: string,
    connectionString: string,
    envKey: string,
    command: string,
    projectRegion?: string | null,
    rootDirectory?: string | null
): Promise<{ operationName: string }> {
    if (process.env.MOCK_DB === 'true') {
        const id = `migrate-${projectId}-${Date.now()}`;
        // Store start time for mock polling
        if (typeof global !== 'undefined') {
            (global as { mockMigrations?: Record<string, number> }).mockMigrations = (global as { mockMigrations?: Record<string, number> }).mockMigrations || {};
            (global as { mockMigrations: Record<string, number> }).mockMigrations[id] = Date.now();
        }
        return { operationName: `projects/mock/locations/global/builds/${id}` };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const region = projectRegion || config.gcp.region || 'asia-south1';
    const accessToken = await getGcpAccessToken();

    // Get repository name from full name (owner/repo -> repo)
    const repoName = repoFullName.split('/')[1] || repoFullName;

    const workDir = rootDirectory ? `/workspace/${rootDirectory.replace(/^\/+|\/+$/g, '')}` : '/workspace';

    const buildConfig = {
        source: {
            connectedRepository: {
                repository: `projects/${gcpProjectId}/locations/${region}/connections/deployify-github/repositories/${repoName}`,
                revision: commitSha,
            },
        },
        steps: [
            {
                name: 'node:20-alpine',
                entrypoint: 'sh',
                dir: workDir,
                args: [
                    '-c',
                    `npm install && ${command}`
                ],
                env: [
                    `${envKey}=${connectionString}`
                ]
            }
        ],
        options: {
            // logging: 'CLOUD_LOGGING_ONLY', // Removed to allow GCS logging for real-time dashboard logs
        },
        tags: ['deployify-migration', projectId],
    };

    const response = await fetch(
        `${CLOUD_BUILD_API}/projects/${gcpProjectId}/locations/${region}/builds`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(buildConfig),
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to trigger migration build: ${await response.text()}`);
    }

    const data = await response.json();
    return { operationName: data.name };
}

/**
 * Get the status and logs of a migration operation
 */
export async function getMigrationStatus(
    operationName: string
): Promise<{
    status: 'QUEUED' | 'WORKING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'TIMEOUT';
    logs?: string;
    error?: string;
}> {
    if (process.env.MOCK_DB === 'true') {
        const id = operationName.split('/').pop() || '';
        const startTime = (global as { mockMigrations?: Record<string, number> }).mockMigrations?.[id] || Date.now();
        const elapsed = Date.now() - startTime;

        if (elapsed < 5000) {
            return {
                status: 'QUEUED',
                logs: '[MOCK] Build queued...\n[MOCK] Waiting for available worker...'
            };
        } else if (elapsed < 15000) {
            return {
                status: 'WORKING',
                logs: '[MOCK] Build queued...\n[MOCK] Waiting for available worker...\n[MOCK] Fetching repository source...\n[MOCK] Running npm install...'
            };
        } else {
            return {
                status: 'SUCCESS',
                logs: '[MOCK] Build queued...\n[MOCK] Waiting for available worker...\n[MOCK] Fetching repository source...\n[MOCK] Running npm install...\n[MOCK] Executing migration command...\n[MOCK] Migration applied successfully.'
            };
        }
    }

    const accessToken = await getGcpAccessToken();

    // operationName is projects/{project}/locations/{location}/builds/{id}
    const response = await fetch(`${CLOUD_BUILD_API}/${operationName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to get migration status: ${await response.text()}`);
    }

    const data = await response.json();

    // Cloud Build API returns an Operation object for the build trigger
    // If it's an operation, the build details are in the metadata
    const isOperation = operationName.includes('/operations/');
    const build = isOperation ? data.metadata : data;

    if (!build) {
        return { status: 'QUEUED' };
    }

    const status = build.status || (data.done ? (data.error ? 'FAILURE' : 'SUCCESS') : 'QUEUED');

    // Fetch logs if available
    let logs = '';
    if (build.logUrl || build.logsBucket) {
        try {
            // Re-use logic from getBuildLogsContent
            const bucketMatch = build.logsBucket?.match(/gs:\/\/(.+)/);
            const bucket = bucketMatch ? bucketMatch[1] : (build.logsBucket || null);
            const buildId = build.id || operationName.split('/').pop();

            if (bucket && buildId) {
                const logFilename = `log-${buildId}.txt`;
                const storageResponse = await fetch(
                    `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${logFilename}?alt=media`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                if (storageResponse.ok) {
                    logs = await storageResponse.text();
                }
            }
        } catch (e) {
            console.error('Failed to fetch migration logs:', e);
        }
    }

    return {
        status: status as 'QUEUED' | 'WORKING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'TIMEOUT',
        logs,
        error: build.failureInfo?.detail || data.error?.message
    };
}
