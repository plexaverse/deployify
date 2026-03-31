import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

const FIRESTORE_API = 'https://firestore.googleapis.com/v1';

/**
 * Provision a new Firestore database
 */
export async function createDatabase(
    databaseId: string,
    region: string
): Promise<{ operationName: string; connectionString: string }> {
    if (process.env.MOCK_DB === 'true') {
        return {
            operationName: `projects/mock/databases/${databaseId}/operations/create`,
            connectionString: `firestore://${databaseId}`
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const parent = `projects/${gcpProjectId}`;

    const response = await fetch(`${FIRESTORE_API}/${parent}/databases?databaseId=${databaseId}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            locationId: region,
            type: 'FIRESTORE_NATIVE',
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create Firestore database: ${await response.text()}`);
    }

    const data = await response.json();
    const connectionString = `firestore://${databaseId}`;

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
    const response = await fetch(`${FIRESTORE_API}/${operationName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to get Firestore operation status: ${await response.text()}`);
    }

    const data = await response.json();
    // Firestore uses the standard Operation resource with a "done" boolean.
    // We map it to the unified PENDING | RUNNING | DONE status for compatibility.
    return {
        status: data.done ? 'DONE' : 'RUNNING',
        error: data.error ? `Firestore Provisioning Error: ${data.error.message || 'Unknown error'}` : undefined,
    };
}

/**
 * Delete a Firestore database
 */
export async function deleteDatabase(databaseId: string): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/databases/${databaseId}/operations/delete`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/databases/${databaseId}`;

    const response = await fetch(`${FIRESTORE_API}/${name}?allow_missing=true`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to delete Firestore database: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}
