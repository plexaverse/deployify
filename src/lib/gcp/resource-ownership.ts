import { config } from '@/lib/config';
import { getGcpAccessToken } from './auth';
import type { Project, StorageConfig } from '@/types';

/**
 * Ownership guard for shared-GCP-project resources.
 *
 * All tenants' managed databases live in ONE shared GCP project
 * (config.gcp.projectId) and instance names carry no tenant prefix, so a
 * caller-supplied resourceId can never be trusted just because the caller
 * proved access to some Deployify project they own.
 *
 * This module answers: "is <resourceId> claimed by <project>?"
 */

export type OwnershipVia =
    | 'mock'
    | 'disabled'
    | 'storage-config'
    | 'registered-provider-project'
    | 'gcp-label';

export type OwnershipResult =
    | { owned: true; via: OwnershipVia }
    | { owned: false; reason: string };

/** Same sanitizer syncResourceLabels() uses when it writes deployify-project-id. */
export function sanitizeLabel(val: string): string {
    return val.toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 63);
}

/** Same derivation every storage route uses: metadata.resourceName ?? slugified name. */
function baseResourceName(storage: StorageConfig): string {
    return (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Every GCP resource name this Deployify project is allowed to touch, derived
 * from its own storageConfigs. Pure + synchronous so it is unit-testable.
 */
export function resolveOwnedResourceNames(project: Project): Set<string> {
    const owned = new Set<string>();

    for (const storage of project.storageConfigs || []) {
        const base = baseResourceName(storage);
        if (!base) continue;

        owned.add(base);

        // Region migration targets: migrateInstanceToRegion() names them
        // `${instanceName}-${targetRegion}` (or `${instanceName}-migrated` in MOCK_DB).
        owned.add(`${base}-migrated`);
        const region = (storage.metadata?.region as string) || project.region;
        if (region) owned.add(`${base}-${region}`);

        // Read replicas: replica/route.ts names them `${master}-replica-${suffix}`
        // and records them under metadata.replicas.
        const replicas = (storage.metadata?.replicas as Array<{ name?: string }> | undefined) || [];
        for (const replica of replicas) {
            if (replica?.name) owned.add(replica.name.toLowerCase().replace(/\s+/g, '-'));
        }
    }

    return owned;
}

/** GCP project ids this Deployify project has registered as bring-your-own. */
export function resolveRegisteredProviderProjects(project: Project): Set<string> {
    const registered = new Set<string>();
    for (const storage of project.storageConfigs || []) {
        if (storage.providerProjectId) registered.add(storage.providerProjectId);
    }
    return registered;
}

/** Reads the live deployify-project-id label. Returns null when unknown/unreadable. */
async function fetchDeployifyProjectLabel(
    resourceType: string,
    resourceId: string,
    region: string | null,
    gcpProjectId: string
): Promise<string | null> {
    const accessToken = await getGcpAccessToken();

    if (resourceType === 'cloud-sql') {
        const res = await fetch(
            `https://sqladmin.googleapis.com/v1/projects/${gcpProjectId}/instances/${encodeURIComponent(resourceId)}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return (data?.settings?.userLabels?.['deployify-project-id'] as string) || null;
    }

    if (resourceType === 'memorystore-redis') {
        if (!region) return null;
        const name = `projects/${gcpProjectId}/locations/${region}/instances/${encodeURIComponent(resourceId)}`;
        const res = await fetch(`https://redis.googleapis.com/v1/${name}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return (data?.labels?.['deployify-project-id'] as string) || null;
    }

    // Firestore databases expose no userLabels on the v1 API -> no label path.
    return null;
}

/**
 * Authoritative check for DELETE /api/gcp/discover.
 *
 * Modes via GCP_RECLAIM_OWNERSHIP_MODE:
 *   'enforce' (default) - deny unproven ownership
 *   'audit'             - log the would-be denial, then allow (break-glass soak only)
 *   'off'               - pre-fix behaviour (break-glass only)
 */
export async function checkResourceOwnership(
    project: Project,
    resourceType: string,
    resourceId: string,
    region: string | null,
    requestedGcpProjectId: string | null
): Promise<OwnershipResult> {
    if (process.env.MOCK_DB === 'true') {
        return { owned: true, via: 'mock' };
    }
    if (process.env.GCP_RECLAIM_OWNERSHIP_MODE === 'off') {
        return { owned: true, via: 'disabled' };
    }

    const platformProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const targetGcpProjectId = requestedGcpProjectId || platformProjectId;

    // Defence in depth for the orphan-purge path (defect product-ux-6). A resource
    // backing a registered connector is IN USE: this endpoint is for leftovers, while
    // tearing down a connector's own instance goes through
    // DELETE /api/projects/[id]/storage, which also cleans up the Firestore document,
    // the Secret Manager entry and the injected env vars.
    //
    // OPT-IN (GCP_RECLAIM_INUSE_GUARD=enforce). Default is today's behaviour, because
    // today a registered name is exactly what GRANTS the delete ('storage-config'
    // below). Checked before the bring-your-own shortcut, which would otherwise wave
    // through the entire GCP project.
    if (process.env.GCP_RECLAIM_INUSE_GUARD === 'enforce' && resolveOwnedResourceNames(project).has(resourceId)) {
        return {
            owned: false,
            reason: `Resource ${resourceId} is in use by a storage connector on this project. Delete the connector from Storage instead.`,
        };
    }

    // Never let a tenant reclaim the platform's own control-plane Firestore.
    if (resourceType === 'firestore' && (resourceId === '(default)' || resourceId === 'default')) {
        return { owned: false, reason: 'The default Firestore database cannot be reclaimed' };
    }

    // Bring-your-own GCP project: the tenant owns the whole project, but only
    // if THIS Deployify project actually registered it on a connector.
    if (targetGcpProjectId && targetGcpProjectId !== platformProjectId) {
        if (resolveRegisteredProviderProjects(project).has(targetGcpProjectId)) {
            return { owned: true, via: 'registered-provider-project' };
        }
        return {
            owned: false,
            reason: `GCP project ${targetGcpProjectId} is not registered on this Deployify project`,
        };
    }

    // Shared platform project: the resource must be claimed by this project.
    if (resolveOwnedResourceNames(project).has(resourceId)) {
        return { owned: true, via: 'storage-config' };
    }

    if (process.env.GCP_RECLAIM_LABEL_FALLBACK !== 'false' && targetGcpProjectId) {
        try {
            const label = await fetchDeployifyProjectLabel(resourceType, resourceId, region, targetGcpProjectId);
            if (label && label === sanitizeLabel(project.id)) {
                return { owned: true, via: 'gcp-label' };
            }
        } catch (e) {
            console.warn(`[ReclaimGuard] Label lookup failed for ${resourceType}/${resourceId}:`, e);
        }
    }

    return {
        owned: false,
        reason: `Resource ${resourceId} is not owned by this project`,
    };
}

/**
 * Filter for GET /api/gcp/discover.
 *
 * DEFAULT IS TODAY'S BEHAVIOUR (returns everything) because narrowing the list
 * changes what the import / orphan-purge UI can see. Opt in with
 * GCP_DISCOVERY_SCOPE=owned once the label backfill has soaked.
 * Only narrows inside the SHARED platform project; a bring-your-own project is
 * returned whole.
 */
export function isDiscoveryVisible(
    project: Project,
    resource: { id: string; type: string; metadata?: Record<string, string | number | boolean | undefined> },
    targetGcpProjectId: string | null
): boolean {
    if (process.env.MOCK_DB === 'true') return true;
    if (process.env.GCP_DISCOVERY_SCOPE !== 'owned') return true;

    // Non-GCP connectors are already scoped by this project's own API keys.
    if (resource.type === 'supabase' || resource.type === 'neon' || resource.type === 'mongodb-atlas') {
        return true;
    }

    const platformProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    if (targetGcpProjectId && targetGcpProjectId !== platformProjectId) return true;

    if (resolveOwnedResourceNames(project).has(resource.id)) return true;
    return resource.metadata?.deployifyProjectId === sanitizeLabel(project.id);
}
