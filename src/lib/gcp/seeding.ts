import { config } from '@/lib/config';
import { getGcpAccessToken } from './auth';
import { getProxyOrchestrationCommand } from './cloudsql';

const CLOUD_BUILD_API = 'https://cloudbuild.googleapis.com/v1';

/**
 * Trigger a seeding execution using GCP Cloud Build
 */
export async function runSeed(
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
        const id = `seed-${projectId}-${Date.now()}`;
        return { operationName: `projects/mock/locations/global/builds/${id}` };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const region = projectRegion || config.gcp.region || 'asia-south1';
    const accessToken = await getGcpAccessToken();

    // Get repository name from full name (owner/repo -> repo)
    const repoName = repoFullName.split('/')[1] || repoFullName;

    const workDir = rootDirectory ? `/workspace/${rootDirectory.replace(/^\/+|\/+$/g, '')}` : '/workspace';

    const cloudSqlMatch = connectionString.match(/\/cloudsql\/([a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+)/i);
    const instanceConnectionName = cloudSqlMatch ? cloudSqlMatch[1] : null;

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

        finalCommand = `${getProxyOrchestrationCommand(instanceConnectionName)} && ` +
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
        tags: ['deployify-seeding', projectId],
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
        throw new Error(`Failed to trigger seeding build: ${await response.text()}`);
    }

    const data = await response.json();
    return { operationName: data.name };
}

/**
 * Perform data anonymization during seeding or cloning
 */
export async function anonymizeData(
    connectionString: string,
    tableConfig: { table: string; columns: string[] }[]
): Promise<void> {
    if (process.env.MOCK_DB === 'true') {
        console.log(`[Anonymizer] Mocking anonymization for ${connectionString.split('@')[1] || 'database'}`);
        for (const config of tableConfig) {
            console.log(`[Anonymizer] MOCK: Masking table ${config.table}, columns: ${config.columns.join(', ')}`);
        }
        return;
    }

    console.log(`[Anonymizer] Starting data masking for ${connectionString.split('@')[1] || 'database'}`);

    const isPostgres = connectionString.startsWith('postgresql') || connectionString.startsWith('postgres');
    const isMysql = connectionString.startsWith('mysql');

    try {
        if (isPostgres) {
            const { Client } = await import('pg');
            const client = new Client({ connectionString });
            await client.connect();

            for (const config of tableConfig) {
                const setClause = config.columns.map(col => {
                    if (col.toLowerCase().includes('email')) {
                        return `${col} = encode(sha256(random()::text::bytea), 'hex') || '@example.com'`;
                    }
                    return `${col} = 'MASKED_' || substring(encode(sha256(random()::text::bytea), 'hex'), 1, 8)`;
                }).join(', ');

                const query = `UPDATE ${config.table} SET ${setClause}`;
                await client.query(query);
            }
            await client.end();
        } else if (isMysql) {
            const mysql = await import('mysql2/promise');
            const connection = await mysql.createConnection(connectionString);

            for (const config of tableConfig) {
                const setClause = config.columns.map(col => {
                    if (col.toLowerCase().includes('email')) {
                        return `${col} = CONCAT(LEFT(SHA2(RAND(), 256), 12), '@example.com')`;
                    }
                    return `${col} = CONCAT('MASKED_', LEFT(SHA2(RAND(), 256), 8))`;
                }).join(', ');

                const query = `UPDATE ${config.table} SET ${setClause}`;
                await connection.execute(query);
            }
            await connection.end();
        }
    } catch (error) {
        console.error(`[Anonymizer] Failed to anonymize data:`, error);
        throw error;
    }

    console.log(`[Anonymizer] Data masking completed successfully.`);
}
