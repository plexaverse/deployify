import { config } from '@/lib/config';

const CLOUD_RUN_API = 'https://run.googleapis.com/v2';

export interface TrafficTarget {
    type: string;
    revision?: string;
    percent?: number;
    tag?: string;
}

interface CloudRunService {
    name: string;
    uri: string;
    latestRevision: string;
    traffic?: TrafficTarget[];
}

/**
 * Get Cloud Run service details
 */
export async function getService(
    serviceName: string,
    accessToken: string,
    projectRegion?: string | null
): Promise<CloudRunService | null> {
    const region = projectRegion || config.gcp.region;
    const fullName = `projects/${config.gcp.projectId}/locations/${region}/services/${serviceName}`;

    const response = await fetch(
        `${CLOUD_RUN_API}/${fullName}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error('Failed to get Cloud Run service');
    }

    const data = await response.json();

    return {
        name: data.name,
        uri: data.uri,
        latestRevision: data.latestReadyRevision,
        traffic: data.traffic,
    };
}

/**
 * Delete a Cloud Run service
 */
export async function deleteService(
    serviceName: string,
    accessToken: string,
    projectRegion?: string | null
): Promise<void> {
    const region = projectRegion || config.gcp.region;
    const fullName = `projects/${config.gcp.projectId}/locations/${region}/services/${serviceName}`;

    const response = await fetch(
        `${CLOUD_RUN_API}/${fullName}`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok && response.status !== 404) {
        throw new Error('Failed to delete Cloud Run service');
    }
}

/**
 * List all services with a prefix
 */
export async function listServices(
    prefix: string,
    accessToken: string,
    projectRegion?: string | null
): Promise<CloudRunService[]> {
    const region = projectRegion || config.gcp.region;
    const parent = `projects/${config.gcp.projectId}/locations/${region}`;

    const response = await fetch(
        `${CLOUD_RUN_API}/${parent}/services?filter=metadata.name:${prefix}*`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error('Failed to list Cloud Run services');
    }

    const data = await response.json();

    return (data.services || []).map((service: { name: string; uri: string; latestReadyRevision: string }) => ({
        name: service.name,
        uri: service.uri,
        latestRevision: service.latestReadyRevision,
    }));
}

/**
 * Helper to calculate new traffic configuration for tags
 */
export function calculateNewTraffic(
    currentTraffic: TrafficTarget[],
    tag: string,
    revision: string | null,
    expectedRevision?: string
): TrafficTarget[] {
    // Clone traffic to avoid mutation
    let newTraffic = [...currentTraffic];

    // If removing (revision is null)
    if (revision === null) {
        if (expectedRevision) {
            // Only remove if it matches expectedRevision
            newTraffic = newTraffic.filter(t => t.tag !== tag || t.revision !== expectedRevision);
            // This filter keeps items where:
            // 1. tag is NOT the target tag (keep other tags)
            // 2. OR tag IS the target tag BUT revision is NOT expectedRevision (keep tag if it moved)
        } else {
            // Unconditionally remove
            newTraffic = newTraffic.filter(t => t.tag !== tag);
        }
    } else {
        // Upsert: Remove any existing entry for this tag first
        newTraffic = newTraffic.filter(t => t.tag !== tag);

        // Add the new tag entry
        newTraffic.push({
            type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
            revision: revision,
            percent: 0, // Tags usually have 0% traffic unless splitting
            tag: tag,
        });
    }

    return newTraffic;
}

/**
 * Update a traffic tag for a service
 */
export async function updateTrafficTag(
    serviceName: string,
    tag: string,
    revision: string | null, // null to remove tag
    accessToken: string,
    projectRegion?: string | null,
    expectedRevision?: string
): Promise<void> {
    const service = await getService(serviceName, accessToken, projectRegion);
    if (!service) {
        throw new Error('Service not found');
    }

    const currentTraffic = service.traffic || [];
    const newTraffic = calculateNewTraffic(currentTraffic, tag, revision, expectedRevision);

    const region = projectRegion || config.gcp.region;
    const fullName = `projects/${config.gcp.projectId}/locations/${region}/services/${serviceName}`;

    const response = await fetch(
        `${CLOUD_RUN_API}/${fullName}`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                traffic: newTraffic,
            }),
        }
    );

    if (!response.ok) {
        throw new Error('Failed to update traffic tags');
    }
}

/**
 * Update service traffic allocation (for rollbacks)
 */
export async function updateTraffic(
    serviceName: string,
    revisionName: string,
    accessToken: string,
    projectRegion?: string | null
): Promise<void> {
    const region = projectRegion || config.gcp.region;
    const fullName = `projects/${config.gcp.projectId}/locations/${region}/services/${serviceName}`;

    const response = await fetch(
        `${CLOUD_RUN_API}/${fullName}`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                traffic: [
                    {
                        type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
                        revision: revisionName,
                        percent: 100,
                    },
                ],
            }),
        }
    );

    if (!response.ok) {
        throw new Error('Failed to update traffic allocation');
    }
}

/**
 * Get service URL for a project
 */
export function getServiceUrl(serviceName: string, projectRegion?: string | null): string {
    const region = projectRegion || config.gcp.region;
    return `https://${serviceName}-${config.gcp.projectId}.${region}.run.app`;
}

/**
 * Generate preview service name for a PR
 */
export function getPreviewServiceName(projectSlug: string, prNumber: number): string {
    return `dfy-${projectSlug.substring(0, 40)}-pr-${prNumber}`;
}

/**
 * Generate production service name
 */
export function getProductionServiceName(projectSlug: string): string {
    return `dfy-${projectSlug.substring(0, 50)}`;
}
