import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

const MEMORYSTORE_API = 'https://redis.googleapis.com/v1';

/**
 * Provision a new Memorystore (Redis) instance
 */
export async function createInstance(
    instanceName: string,
    region: string
): Promise<{ operationName: string; connectionString: string }> {
    if (process.env.MOCK_DB === 'true') {
        return {
            operationName: `projects/mock/locations/${region}/operations/create-${instanceName}`,
            connectionString: `redis://127.0.0.1:6379`
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const parent = `projects/${gcpProjectId}/locations/${region}`;

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
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create Memorystore instance: ${await response.text()}`);
    }

    const data = await response.json();
    // In a real scenario, we'd wait for the IP address. For now, we return a placeholder using the instance name.
    const connectionString = `redis://${instanceName}.redis.cache.google.com:6379`;

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
        throw new Error(`Failed to get operation status: ${await response.text()}`);
    }

    const data = await response.json();
    return {
        status: data.done ? 'DONE' : 'RUNNING',
        error: data.error?.message,
    };
}
