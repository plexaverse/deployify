/**
 * Repo -> project binding integrity.
 *
 * A project is bound to a GitHub repository by `repoFullName` alone, and inbound
 * webhook deliveries are resolved back to a single project with a `where('repoFullName')`
 * + `limit(1)` query (src/lib/db.ts getProjectByRepoFullName).
 *
 * Two facts make that binding forgeable:
 *   1. POST /api/projects only ever calls getRepo() (octokit repos.get), which succeeds
 *      for ANY repository the caller can merely READ. createRepoWebhook() failing with
 *      404/403 is swallowed, so a project is created even when the caller has no rights
 *      on the repo at all.
 *   2. The webhook HMAC secret is GLOBAL (config.github.webhookSecret), so a verified
 *      signature proves only "some repo we installed a hook on", never "the repo that
 *      owns this project".
 *
 * Consequence: a second project can be bound to a victim's repoFullName, and because
 * Firestore returns `__name__` ascending for an equality filter with no orderBy, the
 * squatter wins `limit(1)` whenever their `proj_<random>` id sorts below the victim's.
 * The victim's pushes then silently stop deploying.
 *
 * The only entitlement signal GitHub gives us is admin rights on the repo - webhook
 * creation succeeds for admins and 404s for everyone else, and repos.get returns
 * `permissions.admin` for the authenticated user. This module records that signal at
 * bind time and uses it to break ties at resolve time.
 *
 * Everything here is additive and dual-read: projects written before this module
 * existed carry no `repoVerification`, and every code path treats a missing field as
 * "no evidence" and falls back to exactly today's answer. No backfill is required.
 */
import { getDb, Collections } from '@/lib/firebase';
import { slugCreatedAtMillis as createdAtMillis } from '@/lib/slug-registry';
import type { DocumentData } from 'firebase-admin/firestore';

/**
 * How a create-time binding to an unverified repo is handled.
 *   'off'     - exactly today's behaviour. Nothing is recorded, nothing is checked.
 *   'warn'    - DEFAULT. Records the verification level and audits cross-owner binds.
 *               Never blocks anyone; no user-visible change.
 *   'enforce' - reject with 403 when a caller with no admin rights binds a repo that a
 *               DIFFERENT tenant already has bound.
 */
export type RepoBindingMode = 'off' | 'warn' | 'enforce';

/**
 * How an inbound webhook picks a project when several share one repoFullName.
 *   'legacy'         - DEFAULT. docs[0], byte-identical to today's limit(1).
 *   'verified-first' - Only overrides docs[0] when there is POSITIVE evidence: the
 *                      candidates span more than one tenant AND at least one of them is
 *                      admin-verified. With no evidence it still returns docs[0].
 *
 * Both modes log every cross-tenant collision they see, so operators can review the real
 * population in Cloud Logging BEFORE flipping to 'verified-first'. The default stays
 * 'legacy' because flipping the winner is visible to a live tenant: a genuinely separate
 * tenant that re-connected a repo later and IS its admin would take the deliveries away
 * from a legacy project that currently holds them. That is the correct answer, but it
 * must be a decision someone makes, not one a deploy makes silently weeks later once new
 * projects have populated `repoVerification`.
 */
export type RepoResolutionMode = 'legacy' | 'verified-first';

/** 'admin' means GitHub confirmed admin rights at bind time. 'unverified' means read-only or unknown. */
export type RepoVerificationLevel = 'admin' | 'unverified';

export interface RepoVerification {
    level: RepoVerificationLevel;
    /** Hook id when we successfully installed the webhook, else null. Never undefined - Firestore rejects undefined. */
    webhookId: number | null;
    verifiedAt: Date;
}

/** How many same-repo project docs to inspect before picking an owner. Mirrors SLUG_COLLISION_SCAN_LIMIT. */
export const REPO_COLLISION_SCAN_LIMIT = 10;

export function getRepoBindingMode(): RepoBindingMode {
    // The mock Firestore ignores .where() and reports every document as existing, so no
    // binding check can be meaningful there. Local dev keeps exactly today's code path.
    if (process.env.MOCK_DB === 'true') return 'off';

    const raw = (process.env.PROJECT_REPO_BINDING_MODE || '').trim().toLowerCase();
    if (raw === 'off' || raw === 'warn' || raw === 'enforce') return raw;
    return 'warn';
}

export function getRepoResolutionMode(): RepoResolutionMode {
    if (process.env.MOCK_DB === 'true') return 'legacy';

    const raw = (process.env.PROJECT_REPO_RESOLUTION_MODE || '').trim().toLowerCase();
    return raw === 'verified-first' ? 'verified-first' : 'legacy';
}

/**
 * Tenant that owns a project row. Team projects belong to the team, personal ones to
 * the user - the same person creating two projects on one repo is NOT a collision.
 */
export function repoOwnerKey(data: DocumentData | undefined): string {
    const teamId = data?.teamId;
    if (typeof teamId === 'string' && teamId) return `team:${teamId}`;
    return `user:${data?.userId ?? 'unknown'}`;
}

function isAdminVerified(data: DocumentData | undefined): boolean {
    return (data?.repoVerification as RepoVerification | undefined)?.level === 'admin';
}

/**
 * Build the verification record stored on the project document.
 *
 * `webhookId` is the return of createRepoWebhook (null when it threw). `adminHint` is
 * repos.get's `permissions.admin`, which also covers the case where webhook creation
 * fails with 422 because a hook already exists - GitHub answers 404, not 422, to a
 * caller without admin rights.
 */
export function buildRepoVerification(
    webhookId: number | null,
    adminHint: boolean | undefined
): RepoVerification {
    return {
        level: webhookId !== null || adminHint === true ? 'admin' : 'unverified',
        webhookId,
        verifiedAt: new Date(),
    };
}

/** Octokit surfaces HTTP status on the thrown error; 422 = "hook already exists" = caller is an admin. */
export function isWebhookAlreadyExistsError(error: unknown): boolean {
    return (error as { status?: number } | null)?.status === 422;
}

interface RepoDoc {
    id: string;
    data: () => DocumentData | undefined;
}

/**
 * Pick which project owns an inbound webhook delivery when several share one repoFullName.
 *
 * Returns docs[0] - today's exact answer - unless ALL of the following hold:
 *   - mode is 'verified-first'
 *   - the candidates belong to more than one tenant (a single tenant with several
 *     projects on one repo is a legitimate monorepo setup and is never re-pointed)
 *   - at least one candidate is admin-verified, and docs[0] is not
 * In that case the oldest admin-verified project wins.
 *
 * On existing production data no document carries `repoVerification`, so even in
 * 'verified-first' this is a provable no-op until new projects start recording it.
 */
export function pickRepoBindingOwner<T extends RepoDoc>(docs: T[], repoFullName: string): T {
    if (docs.length <= 1) return docs[0];

    const owners = new Set(docs.map(d => repoOwnerKey(d.data())));
    if (owners.size <= 1) return docs[0];

    const mode = getRepoResolutionMode();
    const verified = docs.filter(d => isAdminVerified(d.data()));

    const oldestVerified = verified.length
        ? [...verified].sort((a, b) => {
            const ta = createdAtMillis(a.data()?.createdAt);
            const tb = createdAtMillis(b.data()?.createdAt);
            if (ta !== tb) return ta - tb;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        })[0]
        : null;

    const winner =
        mode === 'legacy' || !oldestVerified || isAdminVerified(docs[0].data())
            ? docs[0]
            : oldestVerified;

    console.error(
        `[RepoBinding] Cross-tenant repo collision for "${repoFullName}": ` +
        `${docs.map(d => `${d.id}(${repoOwnerKey(d.data())}${isAdminVerified(d.data()) ? ',admin' : ''})`).join(',')} ` +
        `legacyWinner=${docs[0].id} winner=${winner.id} mode=${mode}`
    );

    return winner;
}

export interface RepoBindingConflict {
    projectId: string;
    ownerKey: string;
}

/**
 * Find a project owned by a DIFFERENT tenant that is already bound to this repo.
 * Uses the existing single-field `repoFullName` index - no composite index, so this
 * cannot fail with FAILED_PRECONDITION at deploy time.
 */
export async function findCrossOwnerRepoBinding(
    repoFullName: string,
    ownerKey: string
): Promise<RepoBindingConflict | null> {
    if (!repoFullName || getRepoBindingMode() === 'off') return null;

    const snapshot = await getDb()
        .collection(Collections.PROJECTS)
        .where('repoFullName', '==', repoFullName)
        .limit(REPO_COLLISION_SCAN_LIMIT)
        .get();

    for (const doc of snapshot.docs) {
        const key = repoOwnerKey(doc.data());
        if (key !== ownerKey) {
            return { projectId: (doc.data()?.id as string) || doc.id, ownerKey: key };
        }
    }

    return null;
}

export interface RepoBindingDecision {
    /** false only in 'enforce' mode. 'warn' (default) and 'off' always allow. */
    allowed: boolean;
    conflict: RepoBindingConflict | null;
}

/**
 * Decide whether `ownerKey` may bind `repoFullName`.
 *
 * Admin-verified callers are always allowed - they own the repo, so a second binding is
 * their business. An unverified caller binding a repo another tenant already holds is
 * audited in 'warn' and refused in 'enforce'.
 */
export async function assessRepoBinding(
    repoFullName: string,
    ownerKey: string,
    isAdmin: boolean
): Promise<RepoBindingDecision> {
    const mode = getRepoBindingMode();
    if (mode === 'off' || isAdmin) return { allowed: true, conflict: null };

    let conflict: RepoBindingConflict | null = null;
    try {
        conflict = await findCrossOwnerRepoBinding(repoFullName, ownerKey);
    } catch (error) {
        // Fail OPEN. This lookup is new on a path that works today; a Firestore blip must
        // not turn a working project create into a 500 for a paying tenant.
        console.error(`[RepoBinding] Conflict lookup failed for "${repoFullName}":`, error);
        return { allowed: true, conflict: null };
    }

    if (!conflict) return { allowed: true, conflict: null };

    return { allowed: mode !== 'enforce', conflict };
}
