import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

const SECRET_MANAGER_API = 'https://secretmanager.googleapis.com/v1';

/**
 * Create or update a secret in GCP Secret Manager
 */
export async function upsertSecret(
    secretId: string,
    payload: string,
    projectId?: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/${projectId || 'mock'}/secrets/${secretId}/versions/latest`;
    }

    const gcpProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const parent = `projects/${gcpProjectId}`;
    const secretName = `${parent}/secrets/${secretId}`;

    // 1. Check if secret exists
    const checkResponse = await fetch(`${SECRET_MANAGER_API}/${secretName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (checkResponse.status === 404) {
        // Create secret
        const createResponse = await fetch(`${SECRET_MANAGER_API}/${parent}/secrets?secretId=${secretId}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                replication: { automatic: {} },
            }),
        });

        if (!createResponse.ok) {
            throw new Error(`Failed to create secret: ${await createResponse.text()}`);
        }
    }

    // 2. Add secret version
    const versionResponse = await fetch(`${SECRET_MANAGER_API}/${secretName}:addVersion`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            payload: {
                data: Buffer.from(payload).toString('base64'),
            },
        }),
    });

    if (!versionResponse.ok) {
        throw new Error(`Failed to add secret version: ${await versionResponse.text()}`);
    }

    return `${secretName}/versions/latest`;
}

/**
 * Access a secret value from GCP Secret Manager
 */
export async function getSecretValue(
    secretName: string // Full name including version, e.g., projects/*/secrets/*/versions/latest
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return 'mock-secret-value';
    }

    const accessToken = await getGcpAccessToken();
    const response = await fetch(`${SECRET_MANAGER_API}/${secretName}:access`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to access secret: ${await response.text()}`);
    }

    const data = await response.json();
    return Buffer.from(data.payload.data, 'base64').toString();
}

/**
 * Delete a secret from GCP Secret Manager
 */
export async function deleteSecret(
    secretId: string,
    projectId?: string
): Promise<void> {
    if (process.env.MOCK_DB === 'true') {
        return;
    }

    const gcpProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const secretName = `projects/${gcpProjectId}/secrets/${secretId}`;

    const response = await fetch(`${SECRET_MANAGER_API}/${secretName}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete secret: ${await response.text()}`);
    }
}
