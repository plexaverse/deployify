import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

const MEMORYSTORE_API = 'https://redis.googleapis.com/v1';

/**
 * Provision a new Memorystore (Redis) instance
 */
export async function createInstance(
    instanceName: string,
    region: string,
    options: { ssl?: boolean; authorizedNetwork?: string } = {}
): Promise<{ operationName: string; connectionString: string }> {
    if (process.env.MOCK_DB === 'true') {
        return {
            operationName: `projects/mock/locations/${region}/operations/create-${instanceName}`,
            connectionString: `${options.ssl ? 'rediss' : 'redis'}://127.0.0.1:6379`
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const parent = `projects/${gcpProjectId}/locations/${region}`;
    const network = options.authorizedNetwork || 'default';
    const networkPath = network.includes('/') ? network : `projects/${gcpProjectId}/global/networks/${network}`;

    const response = await fetch(`${MEMORYSTORE_API}/${parent}/instances?instanceId=${instanceName}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            tier: 'BASIC',
            memorySizeGb: 1,
            region,
            authorizedNetwork: networkPath,
            transitEncryptionMode: options.ssl ? 'SERVER_AUTHENTICATION' : 'DISABLED',
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create Memorystore instance: ${await response.text()}`);
    }

    const data = await response.json();
    // In a real scenario, we'd wait for the IP address. For now, we return a placeholder using the instance name.
    const connectionString = `${options.ssl ? 'rediss' : 'redis'}://${instanceName}.redis.cache.google.com:6379`;

    return {
        operationName: data.name,
        connectionString,
    };
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
    const response = await fetch(`${MEMORYSTORE_API}/${operationName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to get Memorystore operation status: ${await response.text()}`);
    }

    const data = await response.json();
    // Memorystore uses the standard Operation resource with a "done" boolean.
    // We map it to the unified PENDING | RUNNING | DONE status for compatibility.
    return {
        status: data.done ? 'DONE' : 'RUNNING',
        error: data.error ? `Memorystore Provisioning Error: ${data.error.message || 'Unknown error'}` : undefined,
    };
}

/**
 * Delete a Memorystore (Redis) instance
 */
export async function deleteInstance(
    instanceName: string,
    region: string,
    projectId?: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/locations/${region}/operations/delete-${instanceName}`;
    }

    const gcpProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/locations/${region}/instances/${instanceName}`;

    const response = await fetch(`${MEMORYSTORE_API}/${name}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to delete Memorystore instance: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Get Memorystore instance details (to retrieve host/IP)
 */
export async function getInstance(
    instanceName: string,
    region: string
): Promise<{ host?: string; port?: number; state?: string }> {
    if (process.env.MOCK_DB === 'true') {
        return { host: '127.0.0.1', port: 6379, state: 'READY' };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/locations/${region}/instances/${instanceName}`;

    const response = await fetch(`${MEMORYSTORE_API}/${name}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to get Memorystore instance: ${await response.text()}`);
    }

    const data = await response.json();
    return {
        host: data.host,
        port: data.port || 6379,
        state: data.state,
    };
}

/**
 * Update a Memorystore (Redis) instance size
 */
export async function updateInstanceSize(
    instanceName: string,
    region: string,
    memorySizeGb: number
): Promise<string> {
    return updateInstanceSettings(instanceName, region, { memorySizeGb });
}

/**
 * Update Memorystore instance settings
 */
export async function updateInstanceSettings(
    instanceName: string,
    region: string,
    settings: {
        memorySizeGb?: number;
        ssl?: boolean;
    }
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/locations/${region}/operations/update-${instanceName}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/locations/${region}/instances/${instanceName}`;

    const updateMask: string[] = [];
    const body: Record<string, unknown> = {};

    if (settings.memorySizeGb !== undefined) {
        updateMask.push('memorySizeGb');
        body.memorySizeGb = settings.memorySizeGb;
    }

    if (settings.ssl !== undefined) {
        updateMask.push('transitEncryptionMode');
        body.transitEncryptionMode = settings.ssl ? 'SERVER_AUTHENTICATION' : 'DISABLED';
    }

    const response = await fetch(`${MEMORYSTORE_API}/${name}?updateMask=${updateMask.join(',')}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Failed to update Memorystore instance settings: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Export a Memorystore (Redis) instance to Google Cloud Storage
 */
export async function exportInstance(
    instanceName: string,
    region: string,
    storageUri: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/locations/${region}/operations/export-${instanceName}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/locations/${region}/instances/${instanceName}`;

    const response = await fetch(`${MEMORYSTORE_API}/${name}:export`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            outputConfig: {
                gcsDestination: {
                    uri: storageUri,
                },
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to export Memorystore instance: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Import a Memorystore (Redis) instance from Google Cloud Storage
 */
export async function importInstance(
    instanceName: string,
    region: string,
    storageUri: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/locations/${region}/operations/import-${instanceName}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/locations/${region}/instances/${instanceName}`;

    const response = await fetch(`${MEMORYSTORE_API}/${name}:import`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            inputConfig: {
                gcsSource: {
                    uri: storageUri,
                },
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to import Memorystore instance: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}
