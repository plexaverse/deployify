import { getProjectSlugForDeployment, sanitizeLabel } from '@/lib/utils';
import { resolveOwnedResourceNames } from './resource-ownership';
import type { Deployment, Project } from '@/types';

/**
 * Orphan classification for GET /api/gcp/discover.
 *
 * The pre-fix rule was `name.includes('-pr-') || name.includes('-branch-')`, minus a
 * substring test against `activeBranchPatterns`. Both halves are wrong:
 *
 *   - Deployify never provisions a per-PR Cloud SQL / Memorystore / Firestore resource.
 *     Preview isolation is done by rewriting the DATABASE NAME inside one instance
 *     (getBranchConnectionString, src/lib/db.ts:498), so `-pr-` in an INSTANCE name only
 *     ever matches a resource the customer named themselves (`acme-pr-analytics`), or a
 *     connector the customer registered as "Acme PR 5" (slugified to `acme-pr-5`).
 *   - `activeBranchPatterns` is built from that same database-name vocabulary
 *     (`pr123`, `feature_x`), which can never be a substring of `acme-pr-123` or
 *     `acme-feature-x`. So the "this one is still live" exemption never fires, and a
 *     live resource is flagged ORPHANED.
 *   - `-branch-` appears in no naming convention anywhere in the repo.
 *
 * Strict mode therefore requires POSITIVE proof before anything is offered for deletion:
 * the GCP labels say Deployify created it for THIS project, its name is exactly a name
 * this project's own deployments derive, and the deployment behind that name is gone.
 * Anything unproven stays ACTIVE - failing closed costs money, failing open costs data.
 */

/** Deployment states that still have a live preview/branch environment behind them. */
const LIVE_DEPLOYMENT_STATUSES = new Set(['queued', 'building', 'deploying', 'ready']);

export interface OrphanCandidate {
    /** GCP resource id (instance id / database id) - what DELETE would be given. */
    id: string;
    /** Display name. Equal to `id` for every GCP-native type discovery lists. */
    name: string;
    type: string;
    metadata?: Record<string, string | number | boolean | undefined>;
}

export interface OrphanContext {
    project: Project;
    /** Recent deployments for this project (the route already loads 100). */
    deployments: Pick<Deployment, 'type' | 'status' | 'gitBranch' | 'pullRequestNumber'>[];
    /** Exactly the array the route passes today. Read only in legacy mode. */
    legacyActivePatterns: string[];
}

export interface OrphanVerdict {
    orphaned: boolean;
    /** Short, user-facing explanation. Surfaced as DiscoveredResource.orphanReason. */
    reason: string;
}

/** Break-glass switch: GCP_ORPHAN_DETECTION=legacy restores the pre-fix heuristic. */
export function isLegacyOrphanDetection(): boolean {
    return process.env.GCP_ORPHAN_DETECTION === 'legacy';
}

/** The pre-fix expression, preserved verbatim so the rollback is provably identical. */
export function classifyOrphanLegacy(name: string, activeBranchPatterns: string[]): OrphanVerdict {
    const isEphemeral = name.includes('-pr-') || name.includes('-branch-');
    const orphaned = isEphemeral
        && activeBranchPatterns.length > 0
        && !activeBranchPatterns.some(p => name.includes(p));

    return {
        orphaned,
        reason: orphaned ? 'Name matches an ephemeral pattern with no active branch (legacy heuristic)' : '',
    };
}

/**
 * Every ephemeral GCP resource name this project's deployments derive, split by whether
 * the deployment behind it is still live. Derived with getProjectSlugForDeployment() -
 * the same function the deploy path uses - so the two can never drift apart.
 *
 * Pure + synchronous so it is unit-testable. Mirrors resolveOwnedServiceNames() in
 * src/lib/gcp/service-ownership.ts.
 */
export function resolveEphemeralResourceNames(
    project: Pick<Project, 'slug'>,
    deployments: Pick<Deployment, 'type' | 'status' | 'gitBranch' | 'pullRequestNumber'>[]
): { active: Set<string>; retired: Set<string> } {
    const active = new Set<string>();
    const retired = new Set<string>();

    for (const deployment of deployments) {
        if (deployment.type === 'production') continue;

        const derived = getProjectSlugForDeployment(project, deployment);
        // A preview with no PR number falls through to the bare production slug.
        // Never claim that name as ephemeral.
        if (!derived || derived === project.slug) continue;

        if (LIVE_DEPLOYMENT_STATUSES.has(deployment.status)) active.add(derived);
        else retired.add(derived);
    }

    // A name is only retired if NO live deployment still uses it (a re-run of the same
    // PR produces a new deployment row with the same derived name).
    for (const name of active) retired.delete(name);

    return { active, retired };
}

/**
 * Decide whether a discovered resource may be offered for deletion.
 *
 * Order matters: the cheapest, most certain "leave it alone" answers come first, and no
 * branch here performs I/O. Firestore databases can never be orphaned in strict mode -
 * the v1 databases API exposes no labels, so proof is unobtainable and the deletion is
 * irreversible.
 */
export function classifyOrphan(resource: OrphanCandidate, ctx: OrphanContext): OrphanVerdict {
    if (isLegacyOrphanDetection()) {
        return classifyOrphanLegacy(resource.name, ctx.legacyActivePatterns);
    }

    // 1. Anything backing a registered connector is in use, whatever it is named.
    //    This is what stops a connector called "Acme PR 5" (-> `acme-pr-5`) from being
    //    purged out from under a running service.
    if (resolveOwnedResourceNames(ctx.project).has(resource.id)) {
        return { orphaned: false, reason: 'In use by a storage connector on this project' };
    }

    // 2. Positive proof of provenance. syncResourceLabels() (src/lib/gcp/labeling.ts)
    //    writes both labels together, so requiring both adds no false negatives beyond
    //    "never labelled at all".
    const managedBy = resource.metadata?.managedBy;
    const projectLabel = resource.metadata?.deployifyProjectId;
    if (managedBy !== 'deployify' || projectLabel !== sanitizeLabel(ctx.project.id)) {
        return { orphaned: false, reason: 'Not labelled as a Deployify-managed resource of this project' };
    }

    // 3. The name has to be one THIS project's deployments actually derive.
    const { active, retired } = resolveEphemeralResourceNames(ctx.project, ctx.deployments);
    if (active.has(resource.id)) {
        return { orphaned: false, reason: 'Backing a preview or branch deployment that is still live' };
    }
    if (!retired.has(resource.id)) {
        return { orphaned: false, reason: 'No retired deployment of this project claims this name' };
    }

    return {
        orphaned: true,
        reason: 'Created for a preview or branch deployment that is no longer running',
    };
}
