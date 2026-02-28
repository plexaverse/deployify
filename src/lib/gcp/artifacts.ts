import { config } from '@/lib/config';
import { getGcpAccessToken } from '@/lib/gcp/auth';

const ARTIFACT_REGISTRY_API = 'https://artifactregistry.googleapis.com/v1';

/**
 * Delete all images for a project (the entire package)
 */
export async function deleteProjectImages(
    serviceName: string,
    projectRegion?: string | null
): Promise<void> {
    const accessToken = await getGcpAccessToken();
    const region = projectRegion || config.gcp.region || process.env.GCP_REGION || 'asia-south1';
    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const repository = config.gcp.artifactRegistry;

    const fullName = `projects/${gcpProjectId}/locations/${region}/repositories/${repository}/packages/${serviceName}`;

    console.log(`[ArtifactRegistry] Deleting package: ${fullName}`);

    const response = await fetch(
        `${ARTIFACT_REGISTRY_API}/${fullName}`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok && response.status !== 404) {
        const error = await response.text();
        console.error(`[ArtifactRegistry] Failed to delete package ${serviceName}:`, error);
        // We don't throw here to avoid blocking project deletion if images are already gone or there's a minor error
    }
}

/**
 * Prune old image versions for a project, keeping only the most recent ones.
 */
export async function pruneProjectImages(
    serviceName: string,
    keepCount: number = 10,
    projectRegion?: string | null
): Promise<void> {
    try {
        const accessToken = await getGcpAccessToken();
        const region = projectRegion || config.gcp.region || process.env.GCP_REGION || 'asia-south1';
        const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
        const repository = config.gcp.artifactRegistry;

        const packagePath = `projects/${gcpProjectId}/locations/${region}/repositories/${repository}/packages/${serviceName}`;

        // 1. List all versions
        const response = await fetch(
            `${ARTIFACT_REGISTRY_API}/${packagePath}/versions?pageSize=1000&view=BASIC`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            }
        );

        if (!response.ok) {
            if (response.status === 404) return; // Package doesn't exist yet
            throw new Error(`Failed to list versions: ${await response.text()}`);
        }

        const data = await response.json();
        const versions = data.versions || [];

        if (versions.length <= keepCount) {
            return;
        }

        // 2. Sort versions by createTime descending
        versions.sort((a: any, b: any) => {
            return new Date(b.createTime).getTime() - new Date(a.createTime).getTime();
        });

        // 3. Identify versions to delete (everything after keepCount)
        const toDelete = versions.slice(keepCount);

        console.log(`[ArtifactRegistry] Pruning ${toDelete.length} old versions for ${serviceName}`);

        // 4. Delete each old version
        for (const version of toDelete) {
            // version.name is already the full path: projects/*/locations/*/repositories/*/packages/*/versions/*
            await fetch(
                `${ARTIFACT_REGISTRY_API}/${version.name}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );
        }
    } catch (error) {
        console.error(`[ArtifactRegistry] Pruning failed for ${serviceName}:`, error);
    }
}
