import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

const SPANNER_API = 'https://spanner.googleapis.com/v1';

/**
 * Provision a new Spanner instance
 */
export async function createSpannerInstance(
    instanceId: string,
    region: string,
    options: {
        nodes?: number;
        processingUnits?: number;
        displayName?: string;
    } = {}
): Promise<{ operationName: string; connectionString: string }> {
    if (process.env.MOCK_DB === 'true') {
        return {
            operationName: `projects/mock/instances/${instanceId}/operations/create`,
            connectionString: `spanner://${instanceId}/default`
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const parent = `projects/${gcpProjectId}`;

    // Spanner requires a specific instance config for the region
    // Common regional config pattern: regional-us-central1
    const configName = `${parent}/instanceConfigs/regional-${region}`;

    const body: {
        config: string;
        displayName: string;
        nodeCount?: number;
        processingUnits?: number;
    } = {
        config: configName,
        displayName: options.displayName || instanceId.toUpperCase(),
    };

    if (options.nodes) {
        body.nodeCount = options.nodes;
    } else if (options.processingUnits) {
        body.processingUnits = options.processingUnits;
    } else {
        // Default to minimum units
        body.processingUnits = 100;
    }

    const response = await fetch(`${SPANNER_API}/${parent}/instances?instanceId=${instanceId}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Failed to create Spanner instance: ${await response.text()}`);
    }

    const data = await response.json();
    const connectionString = `spanner://${instanceId}/default`;

    return {
        operationName: data.name,
        connectionString,
    };
}

/**
 * Create a database within a Spanner instance
 */
export async function createSpannerDatabase(
    instanceId: string,
    databaseId: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/instances/${instanceId}/databases/${databaseId}/operations/create`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const parent = `projects/${gcpProjectId}/instances/${instanceId}`;

    const response = await fetch(`${SPANNER_API}/${parent}/databases`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            createStatement: `CREATE DATABASE \`${databaseId}\``,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create Spanner database: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Check operation status (unified for instance and database)
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
    return {
        status: data.done ? 'DONE' : 'RUNNING',
        error: data.error ? `Spanner Operation Error: ${data.error.message || 'Unknown error'}` : undefined,
    };
}

/**
 * Get Spanner instance details
 */
export async function getInstance(instanceId: string, projectId?: string): Promise<Record<string, unknown>> {
    if (process.env.MOCK_DB === 'true') {
        return {
            name: `projects/mock/instances/${instanceId}`,
            state: 'READY',
            nodeCount: 1,
            processingUnits: 1000,
        };
    }

    const gcpProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/instances/${instanceId}`;

    const response = await fetch(`${SPANNER_API}/${name}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to get Spanner instance: ${await response.text()}`);
    }

    return await response.json();
}

/**
 * Delete a Spanner instance
 */
export async function deleteInstance(instanceId: string, projectId?: string): Promise<void> {
    if (process.env.MOCK_DB === 'true') return;

    const gcpProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/instances/${instanceId}`;

    const response = await fetch(`${SPANNER_API}/${name}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to delete Spanner instance: ${await response.text()}`);
    }
}
