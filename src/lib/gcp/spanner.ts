import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

const SPANNER_API = 'https://spanner.googleapis.com/v1';

/**
 * Provision a new Cloud Spanner instance
 */
export async function createInstance(
    instanceName: string,
    region: string,
    options: {
        nodes?: number;
        processingUnits?: number;
    } = {}
): Promise<{ operationName: string; connectionString: string }> {
    if (process.env.MOCK_DB === 'true') {
        return {
            operationName: `projects/mock/operations/create-spanner-${instanceName}`,
            connectionString: `spanner://deployify-sa@projects/mock/instances/${instanceName}/databases/default`
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    // Spanner instance configs are region-specific, e.g., 'regional-us-central1'
    const configName = `projects/${gcpProjectId}/instanceConfigs/regional-${region}`;

    const response = await fetch(`${SPANNER_API}/projects/${gcpProjectId}/instances`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            instanceId: instanceName,
            instance: {
                config: configName,
                displayName: instanceName,
                nodeCount: options.nodes || (options.processingUnits ? undefined : 1),
                processingUnits: options.processingUnits,
                labels: {
                    managed_by: 'deployify'
                }
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create Cloud Spanner instance: ${await response.text()}`);
    }

    const data = await response.json();
    const connectionString = `spanner://${gcpProjectId}/${instanceName}/default`;

    return {
        operationName: data.name,
        connectionString,
    };
}

/**
 * Create a database within a Spanner instance
 */
export async function createDatabase(
    instanceName: string,
    databaseName: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') return `projects/mock/operations/spanner-db-${databaseName}`;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${SPANNER_API}/projects/${gcpProjectId}/instances/${instanceName}/databases`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            createStatement: `CREATE DATABASE \`${databaseName}\``
        }),
    });

    if (!response.ok) throw new Error(`Failed to create Spanner database: ${await response.text()}`);
    const data = await response.json();
    return data.name;
}

/**
 * Delete a Spanner instance
 */
export async function deleteInstance(instanceName: string): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/operations/delete-spanner-${instanceName}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${SPANNER_API}/projects/${gcpProjectId}/instances/${instanceName}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to delete Cloud Spanner instance: ${await response.text()}`);
    }

    return `projects/${gcpProjectId}/instances/${instanceName}`;
}

/**
 * Check the status of a long-running operation
 */
export async function getOperationStatus(
    operationName: string
): Promise<{ status: 'PENDING' | 'RUNNING' | 'DONE'; error?: string }> {
    if (process.env.MOCK_DB === 'true') {
        return { status: 'DONE' };
    }

    const accessToken = await getGcpAccessToken();
    const response = await fetch(`${SPANNER_API}/${operationName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to get Spanner operation status: ${await response.text()}`);
    }

    const data = await response.json();

    // Spanner operations use metadata and done field
    return {
        status: data.done ? 'DONE' : 'RUNNING',
        error: data.error ? `Cloud Spanner Provisioning Error: ${data.error.message || 'Unknown error'}` : undefined,
    };
}
