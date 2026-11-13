/**
 * Automated provider-token rotation for external storage connectors (Neon / PlanetScale).
 *
 * The trigger is GET /api/projects/[id]/storage/[storageId]/sync:446, which calls
 * rotateProviderToken() (src/lib/gcp/external-sync.ts:500) once the connector is 30 days
 * past `lastRotatedAt`. Three separate defects sit on that path:
 *
 *  1. ROOT CAUSE. src/lib/gcp/secrets.ts upsertSecret() takes a BARE `secretId` and
 *     interpolates it into `projects/<p>/secrets/<secretId>`, but it RETURNS the full
 *     resource name `projects/<p>/secrets/<id>/versions/latest`. Every field that stores
 *     that return value (StorageConfig.connectionStringSecretId,
 *     StorageConfig.providerApiKeySecretId) therefore holds a full path, and the call
 *     sites that feed it back in - external-sync.ts:543 (Neon), external-sync.ts:582
 *     (PlanetScale), sync/route.ts:736 and :782 (Cloud SQL), remediation-utils.ts:241/244/
 *     277/280 (grantSecretAccess) - build a double-prefixed name Secret Manager rejects.
 *     For PlanetScale that throw happens AFTER the new `readwriter` password already
 *     exists at the provider and BEFORE anything records it.
 *
 *  2. sync/route.ts:449 only persists `lastRotatedAt` when the rotation reports success.
 *     Because (1) makes success impossible, `daysSinceRotation` stays >= 30 forever and
 *     EVERY subsequent sync poll mints another live, unrecorded, never-revoked PlanetScale
 *     password. That is the damage happening today. Fixed here with a transactional lease
 *     (claimed BEFORE the provider call, so two overlapping polls cannot both rotate) plus
 *     a failure backoff (so a permanently-failing provider stops being hammered).
 *
 *  3. The cleanup at external-sync.ts:594 lists the whole PlanetScale DATABASE and DELETEs
 *     every password whose name starts with `deployify-rotation-`, excluding only the one
 *     it just created. The prefix carries no project/storage identity and there is no grace
 *     window. It is unreachable today because of (1) - so fixing (1) ARMS it. And deleting
 *     the previous password is not merely a cross-tenant problem: Cloud Run mounts the
 *     connection string with `--set-secrets <KEY>=<secret>/versions/latest`
 *     (src/lib/gcp/cloudbuild.ts:462-472) and resolves `latest` at INSTANCE START, so
 *     already-running tenant containers are still authenticating with the OLD password.
 *     Revoking it is a live outage with no redeploy in between.
 *
 * Rollout. Two independent env flags, each defaulting to TODAY'S OBSERVABLE BEHAVIOUR:
 *
 *   STORAGE_ROTATION_MODE     'rotate' - DEFAULT. Attempt rotation exactly where today's
 *                                        code attempts it, but leased and backed off.
 *                             'audit'  - log the decision, never call the provider. This is
 *                                        the emergency switch that stops orphan password
 *                                        creation dead without touching anything else.
 *                             'off'    - skip the day-30 block entirely.
 *   STORAGE_ROTATION_CLEANUP  'off'    - DEFAULT. Delete nothing. Byte-identical to the
 *                                        reachable behaviour today (the cleanup never runs).
 *                             'audit'  - log exactly which passwords a sweep would delete.
 *                             'sweep'  - delete, but only this connector's own passwords,
 *                                        only outside the grace window, and never one whose
 *                                        username still appears in the live secret.
 *
 * Everything is additive: no new Firestore collection, no new index, no schema change -
 * the lease lives in the existing free-form `StorageConfig.metadata`
 * (src/types/index.ts:541 `metadata?: Record<string, unknown>`), and a legacy document with
 * no such key reads as "not leased". No API response shape or status code changes.
 */

export type StorageRotationMode = 'off' | 'audit' | 'rotate';
export type RotationCleanupMode = 'off' | 'audit' | 'sweep';

/** Unchanged from sync/route.ts:446 - do not move this without a product decision. */
export const ROTATION_INTERVAL_DAYS = 30;

/** How long one poll owns the right to rotate a connector. Longer than the slowest
 *  provider round-trip, short enough that a crashed request self-heals. */
export const ROTATION_LEASE_MS = 10 * 60 * 1000;

/** After a failed attempt, do not try again for this long. Caps orphan creation at
 *  4/day/connector in the worst case instead of one per poll. */
export const ROTATION_FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1000;

/** A superseded PlanetScale password stays live at least this long, because a running
 *  Cloud Run instance keeps the secret version it resolved at start-up. 7 days is longer
 *  than any tenant revision we keep serving without a redeploy. */
export const ROTATION_CLEANUP_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** Legacy prefix. Kept verbatim so names created before this change are still recognised. */
export const ROTATION_NAME_PREFIX = 'deployify-rotation-';

/** `deployify-rotation-<storageId>-<epochMs>`; storageId is `storage_<base36>`. */
const SCOPED_NAME_RE = /^deployify-rotation-(.+)-(\d{10,})$/;

export function getStorageRotationMode(): StorageRotationMode {
    // The mock Firestore hands back canned documents and ignores writes, so a lease there
    // is fiction. Local dev keeps exactly today's code path (rotateProviderToken() already
    // short-circuits to { success: true } under MOCK_DB, external-sync.ts:505).
    if (process.env.MOCK_DB === 'true') return 'rotate';

    const raw = (process.env.STORAGE_ROTATION_MODE || '').trim().toLowerCase();
    if (raw === 'off' || raw === 'audit') return raw;
    return 'rotate';
}

export function getRotationCleanupMode(): RotationCleanupMode {
    if (process.env.MOCK_DB === 'true') return 'off';

    const raw = (process.env.STORAGE_ROTATION_CLEANUP || '').trim().toLowerCase();
    if (raw === 'audit' || raw === 'sweep') return raw;
    return 'off';
}

export function getRotationCleanupGraceMs(): number {
    const raw = Number(process.env.STORAGE_ROTATION_GRACE_HOURS);
    if (!Number.isFinite(raw) || raw <= 0) return ROTATION_CLEANUP_GRACE_MS;
    return raw * 60 * 60 * 1000;
}

/** Name for a newly minted provider credential. Keeps the legacy prefix (so an old name
 *  filter still matches) and adds the storage id, which is what makes a scoped sweep
 *  possible at all. */
export function rotationPasswordName(storageId: string, nowMs: number): string {
    return `${ROTATION_NAME_PREFIX}${storageId}-${nowMs}`;
}

/** null when the name was not produced by rotationPasswordName() - i.e. a legacy
 *  `deployify-rotation-<ts>` orphan, or somebody else's password entirely. */
export function parseRotationPasswordName(
    name: string | undefined
): { storageId: string; createdAtMs: number } | null {
    if (typeof name !== 'string') return null;
    const m = SCOPED_NAME_RE.exec(name);
    if (!m) return null;
    const createdAtMs = Number(m[2]);
    if (!Number.isFinite(createdAtMs)) return null;
    return { storageId: m[1], createdAtMs };
}

// ---------------------------------------------------------------- rotation gate

/** Only the fields the decision needs; keeps it unit-testable without Firestore. */
export interface RotationGateInput {
    /** StorageConfig.lastRotatedAt, or createdAt when never rotated (today's fallback). */
    lastRotatedAtMs: number;
    /** metadata.rotationLeaseUntil - epoch ms. Absent on every legacy document. */
    leaseUntilMs?: number;
    /** metadata.rotationFailedAt - epoch ms of the last failed attempt. */
    lastFailedAtMs?: number;
    nowMs: number;
}

export type RotationSkipReason =
    | 'mode-off'
    | 'not-due'
    | 'leased'
    | 'backoff';

export interface RotationGate {
    mode: StorageRotationMode;
    /** true only when the provider should actually be called. */
    shouldRotate: boolean;
    reason: RotationSkipReason | 'due';
}

export function decideRotation(input: RotationGateInput, mode: StorageRotationMode): RotationGate {
    const { lastRotatedAtMs, leaseUntilMs, lastFailedAtMs, nowMs } = input;

    if (mode === 'off') return { mode, shouldRotate: false, reason: 'mode-off' };

    const days = (nowMs - lastRotatedAtMs) / (1000 * 60 * 60 * 24);
    if (!(days >= ROTATION_INTERVAL_DAYS)) {
        return { mode, shouldRotate: false, reason: 'not-due' };
    }

    if (typeof leaseUntilMs === 'number' && Number.isFinite(leaseUntilMs) && leaseUntilMs > nowMs) {
        return { mode, shouldRotate: false, reason: 'leased' };
    }

    if (
        typeof lastFailedAtMs === 'number' &&
        Number.isFinite(lastFailedAtMs) &&
        nowMs - lastFailedAtMs < ROTATION_FAILURE_BACKOFF_MS
    ) {
        return { mode, shouldRotate: false, reason: 'backoff' };
    }

    return { mode, shouldRotate: mode === 'rotate', reason: 'due' };
}

// ---------------------------------------------------------------- cleanup policy

/** The subset of a PlanetScale password object we rely on. Every field is optional
 *  because the list endpoint's shape is not contractual for us. */
export interface RotationPassword {
    id: string;
    name?: string;
    username?: string;
    created_at?: string;
}

export interface CleanupDecision {
    mode: RotationCleanupMode;
    /** Safe to DELETE. Empty unless mode === 'sweep'. */
    remove: RotationPassword[];
    /** Everything else, with the reason it survived - logged in 'audit'. */
    keep: Array<{ id: string; name?: string; reason: string }>;
}

export interface CleanupInput {
    /** The connector doing the rotation. Only its own passwords are ever candidates. */
    storageId: string;
    /** The password just created; never a candidate. */
    keepId: string;
    nowMs: number;
    graceMs: number;
    /** Current payload of connectionStringSecretId, when it could be read. A password
     *  whose username appears here is what the newest secret version points at. */
    liveConnectionString?: string;
}

/**
 * Which of a PlanetScale database's passwords this connector may revoke.
 *
 * Deliberately conservative - every ambiguity keeps the credential:
 *   - a legacy `deployify-rotation-<ts>` name carries no owner, so it is NEVER deleted
 *     automatically (it may belong to another Deployify connector, or another project,
 *     on the same database). Those are reported for a human sweep.
 *   - a password with no parseable creation time is kept, because the grace window is the
 *     only thing standing between a rotation and a running Cloud Run instance that still
 *     holds the old credential.
 */
export function decideRotationCleanup(
    passwords: RotationPassword[],
    input: CleanupInput,
    mode: RotationCleanupMode
): CleanupDecision {
    const remove: RotationPassword[] = [];
    const keep: CleanupDecision['keep'] = [];
    const live = input.liveConnectionString || '';

    for (const p of passwords) {
        if (!p || typeof p.id !== 'string' || !p.id) continue;
        const label = { id: p.id, name: p.name };

        if (p.id === input.keepId) {
            keep.push({ ...label, reason: 'just-created' });
            continue;
        }
        if (!p.name?.startsWith(ROTATION_NAME_PREFIX)) {
            keep.push({ ...label, reason: 'not-deployify-managed' });
            continue;
        }

        const parsed = parseRotationPasswordName(p.name);
        if (!parsed) {
            keep.push({ ...label, reason: 'legacy-unscoped-name' });
            continue;
        }
        if (parsed.storageId !== input.storageId) {
            keep.push({ ...label, reason: 'other-connector' });
            continue;
        }
        if (p.username && live.includes(p.username)) {
            keep.push({ ...label, reason: 'live-in-secret-manager' });
            continue;
        }

        const createdAtMs = Date.parse(p.created_at || '');
        const ageBasis = Number.isFinite(createdAtMs) ? createdAtMs : parsed.createdAtMs;
        if (!Number.isFinite(ageBasis)) {
            keep.push({ ...label, reason: 'age-unknown' });
            continue;
        }
        if (input.nowMs - ageBasis < input.graceMs) {
            keep.push({ ...label, reason: 'within-grace-window' });
            continue;
        }

        remove.push(p);
    }

    return { mode, remove: mode === 'sweep' ? remove : [], keep };
}
