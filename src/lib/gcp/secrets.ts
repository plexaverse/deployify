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

    // 1. Ensure secret is active (handle recovery if deleted or scheduled for deletion)
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
    } else if (checkResponse.ok) {
        const secret = await checkResponse.json();
        // If scheduled for deletion (has expireTime or ttl), we attempt to recover it by clearing those fields
        if (secret.expireTime || secret.ttl) {
            console.warn(`[Secrets] Secret ${secretId} scheduled for deletion, attempting recovery...`);
            await fetch(`${SECRET_MANAGER_API}/${secretName}?updateMask=expireTime,ttl`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            });
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
 * Grant a service account access to a specific secret (Least Privilege)
 */
export async function grantSecretAccess(
    secretId: string,
    member: string,
    projectId?: string
): Promise<boolean> {
    if (process.env.MOCK_DB === 'true') {
        console.log(`[Secrets] MOCK: Granting accessor role on ${secretId} to ${member}`);
        return true;
    }

    try {
        const gcpProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
        const accessToken = await getGcpAccessToken();
        const secretName = `projects/${gcpProjectId}/secrets/${secretId}`;
        const memberName = member.startsWith('serviceAccount:') ? member : `serviceAccount:${member}`;

        // 1. Get current IAM policy for the secret
        const getPolicyRes = await fetch(`${SECRET_MANAGER_API}/${secretName}:getIamPolicy`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!getPolicyRes.ok) {
            throw new Error(`Failed to get secret IAM policy: ${await getPolicyRes.text()}`);
        }

        const policy = await getPolicyRes.json();
        policy.bindings = policy.bindings || [];

        // 2. Add member to roles/secretmanager.secretAccessor
        let bindingFound = false;
        for (const binding of policy.bindings) {
            if (binding.role === 'roles/secretmanager.secretAccessor') {
                bindingFound = true;
                if (!binding.members.includes(memberName)) {
                    binding.members.push(memberName);
                }
                break;
            }
        }

        if (!bindingFound) {
            policy.bindings.push({
                role: 'roles/secretmanager.secretAccessor',
                members: [memberName],
            });
        }

        // 3. Set updated IAM policy
        const setPolicyRes = await fetch(`${SECRET_MANAGER_API}/${secretName}:setIamPolicy`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ policy }),
        });

        if (!setPolicyRes.ok) {
            throw new Error(`Failed to set secret IAM policy: ${await setPolicyRes.text()}`);
        }

        return true;
    } catch (error) {
        console.error(`[Secrets] Failed to grant access to ${secretId}:`, error);
        return false;
    }
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
 * Ensure a secret is active and recover if needed
 */
export async function ensureSecretActive(
    secretId: string,
    projectId?: string
): Promise<boolean> {
    if (process.env.MOCK_DB === 'true') return true;

    try {
        const gcpProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
        const accessToken = await getGcpAccessToken();
        const secretName = `projects/${gcpProjectId}/secrets/${secretId}`;

        const response = await fetch(`${SECRET_MANAGER_API}/${secretName}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 404) {
            // Recovery via recreation
            const parent = `projects/${gcpProjectId}`;
            await fetch(`${SECRET_MANAGER_API}/${parent}/secrets?secretId=${secretId}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ replication: { automatic: {} } }),
            });
            return true;
        }

        if (response.ok) {
            const secret = await response.json();
            if (secret.expireTime || secret.ttl) {
                await fetch(`${SECRET_MANAGER_API}/${secretName}?updateMask=expireTime,ttl`, {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({}),
                });
            }
            return true;
        }

        return false;
    } catch (error) {
        console.error(`[Secrets] ensureSecretActive failed for ${secretId}:`, error);
        return false;
    }
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
