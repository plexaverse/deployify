import { config } from '@/lib/config';
import { getGcpAccessToken } from '@/lib/gcp/auth';

const ARTIFACT_REGISTRY_API = 'https://artifactregistry.googleapis.com/v1';

/**
 * Make sure the image repository exists in `region` before a build tries to push to it.
 *
 * Artifact Registry repositories are regional: the registry host is derived from the
 * Cloud Run region, so `deployify-images` in asia-south1 is invisible to a build
 * pushing to asia-northeast1-docker.pkg.dev. Projects deployed to a region that was
 * never bootstrapped built fine and then failed at the push step, because the target
 * repository had never been created there.
 *
 * Creating it on demand is idempotent and race-safe: concurrent deploys into a fresh
 * region both call this, one creates and the rest get ALREADY_EXISTS.
 */
export async function ensureImageRepositoryExists(region: string): Promise<void> {
    const accessToken = await getGcpAccessToken();
    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const repository = config.gcp.artifactRegistry;
    const parent = `projects/${gcpProjectId}/locations/${region}`;

    const existing = await fetch(`${ARTIFACT_REGISTRY_API}/${parent}/repositories/${repository}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (existing.ok) return;
    if (existing.status !== 404) {
        throw new Error(
            `Could not check for image repository "${repository}" in ${region}: ` +
            `${existing.status} ${await existing.text()}`
        );
    }

    console.log(`[ArtifactRegistry] Creating missing repository ${repository} in ${region}.`);

    const created = await fetch(
        `${ARTIFACT_REGISTRY_API}/${parent}/repositories?repositoryId=${encodeURIComponent(repository)}`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                format: 'DOCKER',
                description: 'Container images for Deployify-managed services (auto-created per region).',
            }),
        }
    );

    // A concurrent deploy into the same new region wins the race; that is still success.
    if (created.status === 409) return;

    if (!created.ok) {
        throw new Error(
            `Could not create image repository "${repository}" in ${region}: ` +
            `${created.status} ${await created.text()}`
        );
    }

    // Creation is a long-running operation. Returning before it settles would hand the
    // build the same missing-repository push failure this is meant to prevent.
    const operation = await created.json();
    if (operation.done || !operation.name) return;

    for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const poll = await fetch(`${ARTIFACT_REGISTRY_API}/${operation.name}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!poll.ok) continue;

        const status = await poll.json();
        if (!status.done) continue;

        if (status.error) {
            throw new Error(
                `Creating image repository "${repository}" in ${region} failed: ` +
                `${status.error.message || JSON.stringify(status.error)}`
            );
        }
        return;
    }

    throw new Error(
        `Timed out waiting for image repository "${repository}" to be created in ${region}.`
    );
}

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
