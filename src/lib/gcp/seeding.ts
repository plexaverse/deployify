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
    // In a real implementation, this would run UPDATE queries on the target database
    // to mask sensitive information like emails, PII, etc.
    if (process.env.MOCK_DB === 'true') {
        console.log(`[Anonymizer] Mocking anonymization for ${connectionString}`);
        return;
    }

    // Logic for running anonymization SQL
}
