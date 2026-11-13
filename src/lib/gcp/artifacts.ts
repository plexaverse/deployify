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
        versions.sort((a: { createTime: string }, b: { createTime: string }) => {
            return new Date(b.createTime).getTime() - new Date(a.createTime).getTime();
        });

        // 3. Identify versions to delete (everything after keepCount)
        const toDelete = versions.slice(keepCount);


        // 4. Delete each old version
        // Artifact Registry refuses to delete a version that still carries tags unless
        // force=true. Every image here is tagged (commit SHA, and the newest also :latest),
        // so without it the call returns 400 FAILED_PRECONDITION for all of them. The
        // response was also never inspected, which is why the no-op was invisible.
        let deleted = 0;
        const failures: string[] = [];

        for (const version of toDelete) {
            // version.name is already the full path: projects/*/locations/*/repositories/*/packages/*/versions/*
            const res = await fetch(
                `${ARTIFACT_REGISTRY_API}/${version.name}?force=true`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            if (res.ok) {
                deleted++;
            } else {
                failures.push(`${version.name}: ${res.status} ${await res.text()}`);
            }
        }

        if (failures.length > 0) {
            console.error(
                `[ArtifactRegistry] Pruned ${deleted}/${toDelete.length} versions for ${serviceName}; ` +
                `${failures.length} failed. First: ${failures[0]}`
            );
        } else {
            console.log(`[ArtifactRegistry] Pruned ${deleted} old version(s) for ${serviceName}.`);
        }
    } catch (error) {
        console.error(`[ArtifactRegistry] Pruning failed for ${serviceName}:`, error);
    }
}
