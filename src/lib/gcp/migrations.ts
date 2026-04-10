import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import { Migration, StorageType } from '@/types';
import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';
import { getRepoContents } from '../github';

const CLOUD_BUILD_API = 'https://cloudbuild.googleapis.com/v1';

/**
 * List migrations from both the database (applied) and repository (available)
 */
export async function listMigrations(
    connectionString: string,
    storageType: StorageType,
    repoDetails?: {
        accessToken: string;
        repoFullName: string;
        rootDirectory?: string | null;
    }
): Promise<Migration[]> {
    if (process.env.MOCK_DB === 'true') {
        const dbMigrations: Migration[] = [
            { id: '1', name: '20240101000000_init', appliedAt: new Date(Date.now() - 86400000 * 10).toISOString(), status: 'SUCCESS', provider: 'prisma' },
            { id: '2', name: '20240105000000_add_users', appliedAt: new Date(Date.now() - 86400000 * 5).toISOString(), status: 'SUCCESS', provider: 'prisma' },
            { id: '3', name: '20240410000000_fail_migration', appliedAt: new Date(Date.now() - 3600000).toISOString(), status: 'FAILED', provider: 'prisma' }
        ];

        if (repoDetails) {
            // Add some pending migrations for mock
            return [
                ...dbMigrations,
                { id: 'pending-1', name: '20240501000000_new_feature', appliedAt: '', status: 'PENDING', provider: 'prisma' },
                { id: 'pending-2', name: '20240510000000_schema_optimization', appliedAt: '', status: 'PENDING', provider: 'prisma' }
            ];
        }

        return dbMigrations;
    }

    // 1. Fetch applied migrations from DB
    const appliedMigrations = await getAppliedMigrations(connectionString, storageType);

    // 2. Fetch available migrations from Repo if details provided
    if (repoDetails) {
        try {
            const repoMigrations = await getRepoMigrations(
                repoDetails.accessToken,
                repoDetails.repoFullName,
                repoDetails.rootDirectory
            );

            // Merge applied and repo migrations
            const merged = [...appliedMigrations];
            const appliedNames = new Set(appliedMigrations.map(m => m.name));

            for (const repoMig of repoMigrations) {
                if (!appliedNames.has(repoMig.name)) {
                    merged.push({
                        ...repoMig,
                        status: 'PENDING',
                        appliedAt: ''
                    });
                }
            }

            // Sort: Pending migrations (those in repo but not DB) at top, then applied migrations by date DESC
            const sorted = merged.sort((a, b) => {
                if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
                if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
                if (a.appliedAt && b.appliedAt) {
                    return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
                }
                return b.name.localeCompare(a.name);
            });

            // Drift detection: If there are pending migrations, but the DB also has migrations that are NOT in the repo,
            // or if the count of migrations doesn't match the expected state.
            const repoNames = new Set(repoMigrations.map(m => m.name));
            const extraDbMigrations = appliedMigrations.filter(m => !repoNames.has(m.name));

            if (extraDbMigrations.length > 0) {
                // DB has migrations that the repo doesn't know about - it's DRIFTED
                sorted.forEach(m => {
                    if (extraDbMigrations.find(ex => ex.id === m.id)) {
                        // @ts-expect-error - drifted is an optional runtime property
                        m.drifted = true;
                    }
                });
            }

            return sorted;
        } catch (e) {
            console.error('Failed to fetch migrations from repository:', e);
            return appliedMigrations;
        }
    }

    return appliedMigrations;
}

/**
 * List applied migrations from a database by discovering common migration tables
 */
async function getAppliedMigrations(
    connectionString: string,
    storageType: StorageType
): Promise<Migration[]> {
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
 * Discover migrations available in the repository
 */
export async function getRepoMigrations(
    accessToken: string,
    repoFullName: string,
    rootDirectory?: string | null
): Promise<Migration[]> {
    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) return [];

    const migrations: Migration[] = [];
    const rootPath = rootDirectory ? rootDirectory.replace(/^\/+|\/+$/g, '') : '';

    // 1. Check for Prisma migrations (prisma/migrations/*)
    const prismaPath = rootPath ? `${rootPath}/prisma/migrations` : 'prisma/migrations';
    const prismaContents = await getRepoContents(accessToken, owner, repo, prismaPath);

    if (prismaContents && Array.isArray(prismaContents)) {
        for (const item of prismaContents) {
            if (item.type === 'dir' && item.name !== 'migration_lock.toml') {
                migrations.push({
                    id: `repo-prisma-${item.name}`,
                    name: item.name,
                    appliedAt: '',
                    status: 'PENDING',
                    provider: 'prisma'
                });
            }
        }
    }

    // 2. Check for Drizzle migrations (drizzle/ or migrations/*.sql)
    const drizzlePaths = [
        rootPath ? `${rootPath}/drizzle` : 'drizzle',
        rootPath ? `${rootPath}/migrations` : 'migrations'
    ];

    for (const dPath of drizzlePaths) {
        const drizzleContents = await getRepoContents(accessToken, owner, repo, dPath);
        if (drizzleContents && Array.isArray(drizzleContents)) {
            for (const item of drizzleContents) {
                if (item.type === 'file' && item.name.endsWith('.sql')) {
                    const name = item.name.replace('.sql', '');
                    migrations.push({
                        id: `repo-drizzle-${name}`,
                        name: name,
                        appliedAt: '',
                        status: 'PENDING',
                        provider: 'drizzle'
                    });
                }
            }
        }
    }

    return migrations;
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
    rootDirectory?: string | null,
    takeBackup?: boolean
): Promise<{ operationName: string }> {
    if (process.env.MOCK_DB === 'true') {
        const id = `migrate-${projectId}-${Date.now()}`;
        // Store start time for mock polling
        if (typeof global !== 'undefined') {
            const globalObj = global as { mockMigrations?: Record<string, number> };
            globalObj.mockMigrations = globalObj.mockMigrations || {};
            globalObj.mockMigrations[id] = Date.now();
        }
        return { operationName: `projects/mock/locations/global/builds/${id}` };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const region = projectRegion || config.gcp.region || 'asia-south1';
    const accessToken = await getGcpAccessToken();

    // Get repository name from full name (owner/repo -> repo)
    const repoName = repoFullName.split('/')[1] || repoFullName;

    const workDir = rootDirectory ? `/workspace/${rootDirectory.replace(/^\/+|\/+$/g, '')}` : '/workspace';

    const steps: {
        name: string;
        entrypoint: string;
        args: string[];
        dir?: string;
        env?: string[];
    }[] = [];

    // Add pre-migration backup step if requested for Cloud SQL
    const cloudSqlMatch = connectionString.match(/\/cloudsql\/([a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+)/i);
    const instanceConnectionName = cloudSqlMatch ? cloudSqlMatch[1] : null;

    if (takeBackup && instanceConnectionName) {
        // Extract just the instance ID from the full connection name
        const instanceName = instanceConnectionName.split(':').pop() || instanceConnectionName;

        steps.push({
            name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
            entrypoint: 'gcloud',
            args: [
                'sql', 'backups', 'create',
                '--instance', instanceName,
                '--description', `Pre-migration backup for ${projectId} at ${new Date().toISOString()}`
            ]
        });
    }

    let finalConnectionString = connectionString;
    let finalCommand = `npm install && ${command}`;

    if (instanceConnectionName) {
        const isMysql = connectionString.includes('mysql');
        // Rewrite connection string to use Unix socket at /workspace for IAM-based connectivity in build environment
        if (isMysql) {
            finalConnectionString = connectionString.replace(/host=[^&?]+/, `socket=/workspace/${instanceConnectionName}`);
        } else {
            finalConnectionString = connectionString.replace(/host=[^&?]+/, `host=/workspace/${instanceConnectionName}`);
        }

        finalCommand = `curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.11.0/cloud-sql-proxy.linux.amd64 && ` +
            `chmod +x cloud-sql-proxy && ` +
            `./cloud-sql-proxy --enable-iam-login --unix-socket /workspace ${instanceConnectionName} & ` +
            `sleep 3 && ` +
            `npm install && ${command}`;
    }

    steps.push({
        name: 'node:20',
        entrypoint: 'sh',
        dir: workDir,
        args: [
            '-c',
            finalCommand
        ],
        env: [
            `${envKey}=${finalConnectionString}`
        ]
    });

    const buildConfig = {
        source: {
            connectedRepository: {
                repository: `projects/${gcpProjectId}/locations/${region}/connections/deployify-github/repositories/${repoName}`,
                revision: commitSha,
            },
        },
        steps,
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
 * Trigger a rollback execution using GCP Cloud Build
 */
export async function runRollback(
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
        const id = `rollback-${projectId}-${Date.now()}`;
        return { operationName: `projects/mock/locations/global/builds/${id}` };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const region = projectRegion || config.gcp.region || 'asia-south1';
    const accessToken = await getGcpAccessToken();

    const repoName = repoFullName.split('/')[1] || repoFullName;
    const workDir = rootDirectory ? `/workspace/${rootDirectory.replace(/^\/+|\/+$/g, '')}` : '/workspace';

    const cloudSqlMatch = connectionString.match(/\/cloudsql\/([a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+)/i);
    const instanceConnectionName = cloudSqlMatch ? cloudSqlMatch[1] : null;

    let finalConnectionString = connectionString;
    let finalCommand = `npm install && ${command}`;

    if (instanceConnectionName) {
        const isMysql = connectionString.includes('mysql');
        if (isMysql) {
            finalConnectionString = connectionString.replace(/host=[^&?]+/, `socket=/workspace/${instanceConnectionName}`);
        } else {
            finalConnectionString = connectionString.replace(/host=[^&?]+/, `host=/workspace/${instanceConnectionName}`);
        }

        finalCommand = `curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.11.0/cloud-sql-proxy.linux.amd64 && ` +
            `chmod +x cloud-sql-proxy && ` +
            `./cloud-sql-proxy --enable-iam-login --unix-socket /workspace ${instanceConnectionName} & ` +
            `sleep 3 && ` +
            `npm install && ${command}`;
    }

    const buildConfig = {
        source: {
            connectedRepository: {
                repository: `projects/${gcpProjectId}/locations/${region}/connections/deployify-github/repositories/${repoName}`,
                revision: commitSha,
            },
        },
        steps: [
            {
                name: 'node:20',
                entrypoint: 'sh',
                dir: workDir,
                args: [
                    '-c',
                    finalCommand
                ],
                env: [
                    `${envKey}=${finalConnectionString}`
                ]
            }
        ],
        tags: ['deployify-rollback', projectId],
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
        throw new Error(`Failed to trigger rollback build: ${await response.text()}`);
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
        const globalObj = global as { mockMigrations?: Record<string, number> };
        const startTime = globalObj.mockMigrations?.[id] || Date.now();
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
