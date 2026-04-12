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

/**
 * Validate a Firestore database ID
 */
export function validateDatabaseId(id: string): boolean {
    // Firestore DB ID: 4-63 chars, lowercase, numbers, hyphens. Start with letter, end with letter/number.
    const regex = /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/;
    return regex.test(id);
}

/**
 * Ensure an ephemeral Firestore database exists for branching
 */
export async function ensureEphemeralDatabase(
    databaseId: string,
    region: string
): Promise<void> {
    if (process.env.MOCK_DB === 'true') return;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/databases/${databaseId}`;

    // 1. Check if database exists
    const checkResponse = await fetch(`${FIRESTORE_API}/${name}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (checkResponse.ok) return; // Already exists

    // 2. Create if not exists
    await createDatabase(databaseId, region);
}

/**
 * Export Firestore documents to Google Cloud Storage
 */
export async function exportDocuments(
    databaseId: string,
    outputUriPrefix: string,
    collectionIds: string[] = []
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/databases/${databaseId}/operations/export-${Date.now()}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/databases/${databaseId}`;

    const response = await fetch(`${FIRESTORE_API}/${name}:exportDocuments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            outputUriPrefix,
            collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to export Firestore documents: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Import Firestore documents from Google Cloud Storage
 */
export async function importDocuments(
    databaseId: string,
    inputUriPrefix: string,
    collectionIds: string[] = []
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/databases/${databaseId}/operations/import-${Date.now()}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/databases/${databaseId}`;

    const response = await fetch(`${FIRESTORE_API}/${name}:importDocuments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            inputUriPrefix,
            collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to import Firestore documents: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}
