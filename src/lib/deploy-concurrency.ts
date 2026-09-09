/**
 * Serialization / supersede-cancel for concurrent builds of the same deploy target.
 *
 * Every production build of a project deploys to the SAME Cloud Run service
 * (`dfy-<slug>`, src/lib/utils.ts generateServiceName) and ends with an unconditional
 * `gcloud run deploy` + `gcloud run services update-traffic --to-latest`
 * (src/lib/gcp/cloudbuild.ts). Nothing serialised those builds:
 *
 *   - src/app/api/projects/[id]/deploy/route.ts  -> createDeployment + submitCloudBuild
 *   - src/app/api/webhooks/github/route.ts       -> createDeployment + submitCloudBuild (push + PR)
 *
 * So two pushes 30 s apart, or one double-clicked Deploy button, run two Cloud Builds in
 * parallel against one service. Build duration swings by minutes with Docker layer / GCS
 * cache hits, so the OLDER commit can finish last, take 100% of the traffic, and leave the
 * newer deployment row recorded as `ready` with the wrong `cloudRunRevision` and the wrong
 * `project.productionUrl` bookkeeping.
 *
 * This module decides, for a freshly created deployment, which in-flight deployments of the
 * SAME target it supersedes. The caller cancels those (Cloud Build cancel + Firestore
 * `status: 'cancelled'`). Marking the row terminal is what actually stops the loser writing
 * `ready`: syncDeploymentStatus() returns early on a terminal status, and it is the only
 * writer, on all four of its call sites (pollBuildStatus, /projects/[id],
 * /projects/[id]/deployments, /deployments/[deployId]/logs).
 *
 * Rollout is behind DEPLOY_CONCURRENCY_MODE and DEFAULTS TO TODAY'S BEHAVIOUR:
 *
 *   'off'       - DEFAULT. Kill switch. Not one extra Firestore read. Byte-identical to today.
 *   'audit'     - reads the recent deployments and logs what it WOULD cancel. Never cancels,
 *                 never blocks. Use this to size the blast radius on live tenants.
 *   'supersede' - cancels the older in-flight builds of the same target before submitting,
 *                 and refuses to submit when a NEWER build for that target already exists.
 *
 * Everything is additive: no new Firestore collection, no new composite index (the scan
 * reuses the existing `deployments (projectId ASC, createdAt DESC)` index via
 * listDeploymentsByProject), no schema change, no field added to any document.
 * Every failure path is fail-open - a Firestore or Cloud Build hiccup must never stop a
 * paying tenant from shipping.
 */
import { getDeploymentById, listDeploymentsByProject, updateDeployment } from '@/lib/db';
import { cancelBuild } from '@/lib/gcp/cloudbuild';
import { generateServiceName, getProjectSlugForDeployment } from '@/lib/utils';
import type { Deployment, DeploymentStatus, Project } from '@/types';

export type DeployConcurrencyMode = 'off' | 'audit' | 'supersede';

/** Statuses that mean "a Cloud Build for this row may still reach `gcloud run deploy`". */
export const ACTIVE_DEPLOYMENT_STATUSES: ReadonlySet<DeploymentStatus> = new Set<DeploymentStatus>([
    'queued',
    'building',
    'deploying',
]);

/**
 * How many recent deployment rows to inspect. The existing
 * (projectId ASC, createdAt DESC) index already backs this read, and the busiest real
 * project cannot have more than a handful of builds in flight at once.
 */
export const DEPLOY_SCAN_LIMIT = 25;

/** Written to `errorMessage` on a row we cancel. Rendered by the existing UI as-is. */
export const SUPERSEDED_MESSAGE = 'Superseded by a newer deployment';

export function getDeployConcurrencyMode(): DeployConcurrencyMode {
    // The mock Firestore ignores .where() and hands back canned documents, so any scan
    // there is fiction. Local dev / audit runs keep exactly today's code path.
    if (process.env.MOCK_DB === 'true') return 'off';

    const raw = (process.env.DEPLOY_CONCURRENCY_MODE || '').trim().toLowerCase();
    if (raw === 'audit' || raw === 'supersede') return raw;
    return 'off';
}

/** Minimal shape the pure decision needs. Keeps the logic unit-testable without Firestore. */
export interface DeployRow {
    id: string;
    status: DeploymentStatus;
    createdAtMs: number;
    /** Cloud Run service this build will deploy to. `null` when it cannot be derived. */
    target: string | null;
    cloudBuildId?: string;
}

export interface SupersedeDecision {
    mode: DeployConcurrencyMode;
    /** Older in-flight builds of the same target. Cancel these before submitting. */
    supersede: DeployRow[];
    /** A NEWER in-flight build of the same target already exists; do not submit. */
    blockedBy: DeployRow | null;
}

const NO_OP: Omit<SupersedeDecision, 'mode'> = { supersede: [], blockedBy: null };

/**
 * The Cloud Run service a deployment's build will deploy to and route traffic on.
 * Exactly the name the build config uses: generateServiceName(getProjectSlugForDeployment(...)).
 *
 * Returns null for any row we cannot map with confidence (legacy documents written before a
 * field existed, unknown `type`). Null never supersedes and is never superseded - unknown
 * rows keep today's behaviour rather than being cancelled on a guess.
 */
export function deployTargetKey(
    project: Pick<Project, 'slug'>,
    deployment: Pick<Deployment, 'type' | 'gitBranch' | 'pullRequestNumber'>
): string | null {
    if (!project || typeof project.slug !== 'string' || project.slug.length === 0) return null;
    if (!deployment) return null;

    const type = deployment.type;
    if (type !== 'production' && type !== 'preview' && type !== 'branch') return null;

    // getProjectSlugForDeployment() calls slugify(gitBranch) for branch deployments, which
    // throws on a legacy row with no gitBranch.
    if (type === 'branch' && typeof deployment.gitBranch !== 'string') return null;

    const slug = getProjectSlugForDeployment(project, {
        type,
        gitBranch: typeof deployment.gitBranch === 'string' ? deployment.gitBranch : '',
        pullRequestNumber: deployment.pullRequestNumber,
    });

    return generateServiceName(slug);
}

/** Total order over deployments: newest first, document id as a stable tiebreak. */
export function isNewerDeployRow(a: Pick<DeployRow, 'id' | 'createdAtMs'>, b: Pick<DeployRow, 'id' | 'createdAtMs'>): boolean {
    if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs > b.createdAtMs;
    return a.id > b.id;
}

/**
 * Pure decision. `rows` is the recent deployment history for the project (self may be in it).
 *
 * Both sides of a genuine race reach the same verdict because the order is total and
 * deterministic: the newer request cancels the older one, and the older request - if it has
 * not submitted yet - refuses to submit. Neither needs a lock.
 */
export function decideSupersede(
    mode: DeployConcurrencyMode,
    self: DeployRow,
    rows: readonly DeployRow[]
): SupersedeDecision {
    if (mode === 'off') return { mode, ...NO_OP };
    if (!self.target) return { mode, ...NO_OP };

    const rivals = rows.filter(row =>
        row.id !== self.id &&
        row.target !== null &&
        row.target === self.target &&
        ACTIVE_DEPLOYMENT_STATUSES.has(row.status)
    );

    const supersede: DeployRow[] = [];
    let blockedBy: DeployRow | null = null;

    for (const rival of rivals) {
        if (isNewerDeployRow(rival, self)) {
            if (!blockedBy || isNewerDeployRow(rival, blockedBy)) blockedBy = rival;
        } else {
            supersede.push(rival);
        }
    }

    // Losing the race outranks winning it: if something newer is already in flight there is
    // nothing to supersede, because that newer build will supersede these rows itself.
    if (blockedBy) return { mode, supersede: [], blockedBy };

    return { mode, supersede, blockedBy: null };
}

/** Normalise every createdAt representation Firestore/db.ts can hand back to millis. */
export function deployCreatedAtMillis(value: unknown): number {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return parsed;
    }
    if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
        const d = (value as { toDate: () => Date }).toDate();
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d.getTime();
    }
    // Undated rows sort oldest, so they are superseded rather than treated as the winner.
    return 0;
}

export function toDeployRow(project: Pick<Project, 'slug'>, deployment: Deployment): DeployRow {
    return {
        id: deployment.id,
        status: deployment.status,
        createdAtMs: deployCreatedAtMillis(deployment.createdAt),
        target: deployTargetKey(project, deployment),
        cloudBuildId: deployment.cloudBuildId,
    };
}

export interface SupersedeOutcome {
    mode: DeployConcurrencyMode;
    /** True only when the caller must NOT submit a Cloud Build. Never true outside 'supersede'. */
    blocked: boolean;
    /** Ids actually cancelled (empty in 'off' and 'audit'). */
    cancelledIds: string[];
    blockedByDeploymentId?: string;
}

/**
 * Cancel the in-flight builds this deployment supersedes.
 *
 * Call it AFTER createDeployment() and BEFORE submitCloudBuild(). Fail-open in every
 * direction: any thrown error returns { blocked: false } so the deployment proceeds
 * exactly as it does today.
 */
export async function supersedeActiveDeployments(
    project: Pick<Project, 'id' | 'slug' | 'region'>,
    deployment: Deployment
): Promise<SupersedeOutcome> {
    const mode = getDeployConcurrencyMode();
    if (mode === 'off') return { mode, blocked: false, cancelledIds: [] };

    try {
        const self = toDeployRow(project, deployment);
        if (!self.target) return { mode, blocked: false, cancelledIds: [] };

        const recent = await listDeploymentsByProject(project.id, DEPLOY_SCAN_LIMIT);
        const rows = recent.map(d => toDeployRow(project, d));
        const decision = decideSupersede(mode, self, rows);

        if (decision.blockedBy) {
            console.warn(
                `[DeployConcurrency] project=${project.id} deployment=${deployment.id} ` +
                `target=${self.target} mode=${mode} superseded-before-submit-by=${decision.blockedBy.id}`
            );
            if (mode !== 'supersede') return { mode, blocked: false, cancelledIds: [] };
            return {
                mode,
                blocked: true,
                cancelledIds: [],
                blockedByDeploymentId: decision.blockedBy.id,
            };
        }

        if (decision.supersede.length === 0) return { mode, blocked: false, cancelledIds: [] };

        console.warn(
            `[DeployConcurrency] project=${project.id} deployment=${deployment.id} ` +
            `target=${self.target} mode=${mode} supersedes=${decision.supersede.map(r => r.id).join(',')}`
        );

        if (mode !== 'supersede') return { mode, blocked: false, cancelledIds: [] };

        const cancelledIds: string[] = [];
        for (const loser of decision.supersede) {
            try {
                // Firestore first: this is what stops syncDeploymentStatus() from writing
                // `ready` / `cloudRunRevision` / `productionUrl` for the losing build, on
                // every one of its call sites, even if the Cloud Build cancel below fails.
                await updateDeployment(loser.id, {
                    status: 'cancelled',
                    errorMessage: SUPERSEDED_MESSAGE,
                });
                cancelledIds.push(loser.id);
            } catch (e) {
                console.error(`[DeployConcurrency] failed to mark ${loser.id} cancelled:`, e);
                continue;
            }

            if (!loser.cloudBuildId) continue;
            try {
                await cancelBuild(loser.cloudBuildId, project.region);
            } catch (e) {
                // Same tolerance the DELETE handler in the deploy route already has: the DB
                // status is the part the UI and the pollers read.
                console.error(`[DeployConcurrency] failed to cancel Cloud Build ${loser.cloudBuildId}:`, e);
            }
        }

        return { mode, blocked: false, cancelledIds };
    } catch (e) {
        console.error(`[DeployConcurrency] scan failed for project ${project.id}; allowing deployment:`, e);
        return { mode, blocked: false, cancelledIds: [] };
    }
}

/**
 * Closes the one window supersedeActiveDeployments() cannot: a rival can be created and can
 * cancel this row DURING the seconds this request spends in getEnvVarsForDeployment()
 * (Secret Manager) + submitCloudBuild(). Without this check the loser would then write
 * `status: 'building'` over its own `cancelled` row and resurrect the very race we cancelled.
 *
 * Call it immediately after submitCloudBuild() and before the updateDeployment() that flips
 * the row to 'building'. Returns true when the caller must stop.
 */
export async function abortIfSuperseded(
    deploymentId: string,
    buildId: string,
    projectRegion?: string | null
): Promise<boolean> {
    if (getDeployConcurrencyMode() !== 'supersede') return false;

    try {
        const current = await getDeploymentById(deploymentId);
        if (!current || current.status !== 'cancelled') return false;

        console.warn(
            `[DeployConcurrency] deployment=${deploymentId} was superseded while its build was ` +
            `being submitted; cancelling build ${buildId}`
        );

        try {
            await cancelBuild(buildId, projectRegion);
        } catch (e) {
            console.error(`[DeployConcurrency] failed to cancel orphaned Cloud Build ${buildId}:`, e);
        }
        // Re-stamp the reason: the row is already 'cancelled', we only attach the build id so
        // the orphaned build is traceable from the deployment history.
        try {
            await updateDeployment(deploymentId, { cloudBuildId: buildId, errorMessage: SUPERSEDED_MESSAGE });
        } catch (e) {
            console.error(`[DeployConcurrency] failed to record orphaned build on ${deploymentId}:`, e);
        }
        return true;
    } catch (e) {
        // Fail open: never strand a build because a read failed.
        console.error(`[DeployConcurrency] post-submit supersede check failed for ${deploymentId}:`, e);
        return false;
    }
}
