import { getGcpAccessToken } from './auth';
import { resolveManagedResourceName } from '@/lib/gcp/resource-ownership';
import { config } from '@/lib/config';
import type { StorageConfig, Project } from '@/types';

/**
 * Synchronize Deployify project metadata to GCP resource labels for cost attribution
 */
export async function syncResourceLabels(
    project: Project,
    storage: StorageConfig
): Promise<{ success: boolean; error?: string }> {
    if (process.env.MOCK_DB === 'true') {
        return { success: true };
    }

    const gcpProjectId = storage.providerProjectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;

    // SECURITY: this WRITES `deployify-project-id`, which every ownership check now treats as
    // proof. Deriving the target from the free-text display name would let a tenant stamp
    // their own label onto another tenant's instance and thereby grant themselves ownership
    // of it. Only a server-written resourceName may be labelled.
    const resourceName = resolveManagedResourceName(storage);
    if (!resourceName) {
        console.warn(`[Labeling] Connector ${storage.id} has no server-written resourceName; skipping label sync.`);
        return { success: true };
    }

    const region = (storage.metadata?.region as string) || project.region || 'us-central1';

    const sanitizeLabel = (val: string) => val.toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 63);

    // Standard Deployify labels
    const labels = {
        'deployify-team-id': sanitizeLabel(project.teamId || 'personal'),
        'deployify-project-id': sanitizeLabel(project.id),
        'deployify-environment': sanitizeLabel(storage.environment),
        'managed-by': 'deployify'
    };

    try {
        if (storage.type.includes('cloud-sql')) {
            return await syncCloudSqlLabels(gcpProjectId!, resourceName, labels);
        } else if (storage.type === 'memorystore-redis') {
            return await syncMemorystoreLabels(gcpProjectId!, region, resourceName, labels);
        }

        return { success: true }; // Skip for types without direct labeling support here
    } catch (error) {
        console.error(`[Labeling] Failed for ${storage.id}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown labeling error'
        };
    }
}

/**
 * Update labels for a Cloud SQL instance
 */
async function syncCloudSqlLabels(
    projectId: string,
    instanceId: string,
    labels: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
    const accessToken = await getGcpAccessToken();
    const url = `https://sqladmin.googleapis.com/v1/projects/${projectId}/instances/${instanceId}`;

    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            settings: {
                userLabels: labels
            }
        }),
    });

    if (!response.ok) {
        throw new Error(`Cloud SQL labeling failed: ${await response.text()}`);
    }

    return { success: true };
}

/**
 * Update labels for a Memorystore (Redis) instance
 */
async function syncMemorystoreLabels(
    projectId: string,
    region: string,
    instanceId: string,
    labels: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
    const accessToken = await getGcpAccessToken();
    const name = `projects/${projectId}/locations/${region}/instances/${instanceId}`;
    const url = `https://redis.googleapis.com/v1/${name}?updateMask=labels`;

    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labels }),
    });

    if (!response.ok) {
        throw new Error(`Memorystore labeling failed: ${await response.text()}`);
    }

    return { success: true };
}
