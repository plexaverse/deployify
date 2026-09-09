/**
 * Plan gate for tenant-facing GCP infrastructure provisioning.
 *
 * src/app/api/projects/[id]/storage/route.ts takes `metadata.tier` and
 * `metadata.highAvailability` straight out of the request body and hands them to
 * createInstance() / updateInstanceSettings() in src/lib/gcp/cloudsql.ts. A tier enum
 * exists, but only as <option> values in src/components/StorageSection.tsx - no server
 * code has ever read it. Any signed-up user is `owner` on the project they just created,
 * so checkProjectAccess() passes and `access.role !== 'viewer'`, and nothing else stands
 * between the body and the Cloud SQL Admin API. There is also no cap on how many
 * instances one account may provision.
 *
 * Closing that on a live system can only be done carefully, so it ships behind
 * STORAGE_PROVISION_GATE_MODE:
 *
 *   'off'     - no check at all. Kill switch; zero extra reads.
 *   'audit'   - DEFAULT. Exactly today's behaviour. Violations are logged and nothing
 *               is ever blocked, so operators can size the blast radius first.
 *   'enforce' - the request is rejected before any GCP call is made.
 *
 * Non-breaking by construction:
 *   - The allowlist is the exact union of the <option> values StorageSection.tsx can
 *     emit, so every click the dashboard can produce passes even in 'enforce'.
 *   - A tier equal to the one already stored on the config is ALWAYS allowed. Adopted
 *     and discovered instances get their real tier written back by
 *     src/app/api/projects/[id]/storage/[storageId]/sync/route.ts:476, which can be any
 *     Cloud SQL machine type (db-n1-standard-4, ...). Re-submitting the stored value is
 *     a no-op scale and must not start failing.
 *   - The quota is skipped entirely under MOCK_DB, where createMockFirestore() serves
 *     two synthetic projects that each already carry two provisioned configs.
 *   - Every failure path allows the request. A billing or Firestore outage must never
 *     stop a paying tenant from provisioning.
 */
import { getUserTier } from './caps';
import { type Tier, type TierType } from './tiers';
import { listProjectsByUser } from '@/lib/db';
import type { Project, StorageConfig } from '@/types';

export type ProvisionGateMode = 'off' | 'audit' | 'enforce';

/**
 * Server mirror of every Cloud SQL tier the dashboard can send. Union of the four
 * <select> blocks in src/components/StorageSection.tsx (scale modal ~2370, auto-pilot
 * min ~2468 and max ~2505, replica modal ~3803). Identical to the ordering array in
 * src/app/api/cron/optimize/route.ts:15, which is what auto-pilot scales along.
 */
export const CLOUD_SQL_TIER_ALLOWLIST: readonly string[] = [
    'db-f1-micro',
    'db-g1-small',
    'db-custom-1-3840',
    'db-custom-2-7680',
    'db-custom-4-15360',
    'db-custom-8-30720',
];

/** Storage types Deployify provisions into its OWN GCP project, i.e. the ones we pay for. */
export const GCP_BILLED_STORAGE_TYPES: readonly string[] = [
    'cloud-sql-postgres',
    'cloud-sql-mysql',
    'memorystore-redis',
    'firestore',
];

/** Instances one account owner may have provisioned at once. Deliberately generous. */
export const PROVISIONED_INSTANCE_QUOTA: Record<TierType, number> = {
    free: 3,
    pro: 15,
    team: 60,
    enterprise: Infinity,
};

export interface GateDecision {
    mode: ProvisionGateMode;
    /** True only in 'enforce'. In 'audit' a violation sets `violation` and leaves this false. */
    blocked: boolean;
    violation?: 'tier' | 'quota' | 'highAvailability';
    status?: number;
    message?: string;
}

export function getProvisionGateMode(): ProvisionGateMode {
    const raw = (process.env.STORAGE_PROVISION_GATE_MODE || '').trim().toLowerCase();
    if (raw === 'off' || raw === 'enforce') return raw;
    return 'audit';
}

/**
 * Ops safety valve: STORAGE_TIER_ALLOWLIST_EXTRA=db-n1-standard-4,db-custom-16-61440
 * unblocks a specific tenant without a deploy.
 */
export function getCloudSqlTierAllowlist(): ReadonlySet<string> {
    const extra = (process.env.STORAGE_TIER_ALLOWLIST_EXTRA || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    return new Set([...CLOUD_SQL_TIER_ALLOWLIST, ...extra]);
}

/** Minimum plan allowed to turn on Cloud SQL HA (doubles instance cost). Permissive by default. */
export function getHighAvailabilityMinPlan(): TierType {
    const raw = (process.env.STORAGE_HA_MIN_PLAN || '').trim().toLowerCase();
    if (raw === 'pro' || raw === 'team' || raw === 'enterprise') return raw;
    return 'free';
}

const PLAN_RANK: Record<TierType, number> = { free: 0, pro: 1, team: 2, enterprise: 3 };

export function getProvisionQuota(tier: Tier): number {
    const override = Number(process.env[`STORAGE_PROVISION_QUOTA_${tier.id.toUpperCase()}`]);
    if (Number.isFinite(override) && override >= 0) return override;
    return PROVISIONED_INSTANCE_QUOTA[tier.id] ?? PROVISIONED_INSTANCE_QUOTA.free;
}

/**
 * Pure. `currentTier` is whatever is already persisted on the config (undefined on create).
 */
export function decideCloudSqlTier(
    mode: ProvisionGateMode,
    requestedTier: unknown,
    currentTier: unknown,
    allowlist: ReadonlySet<string>
): GateDecision {
    if (mode === 'off') return { mode, blocked: false };

    // Absent / empty is the historical default: createInstance() falls back to
    // db-f1-micro and PATCH's `hasTierChange` treats it as no change.
    if (requestedTier === undefined || requestedTier === null || requestedTier === '') {
        return { mode, blocked: false };
    }

    if (typeof requestedTier !== 'string') {
        return {
            mode,
            blocked: mode === 'enforce',
            violation: 'tier',
            status: 400,
            message: 'Machine tier must be a string.',
        };
    }

    const tier = requestedTier.trim();
    if (tier === '') return { mode, blocked: false };

    // Legacy / adopted instances: keeping the tier you already have is never a change.
    if (typeof currentTier === 'string' && currentTier.trim() === tier) {
        return { mode, blocked: false };
    }

    if (allowlist.has(tier)) return { mode, blocked: false };

    return {
        mode,
        blocked: mode === 'enforce',
        violation: 'tier',
        status: 400,
        message:
            `Unsupported machine tier "${tier}". Supported tiers: ` +
            `${CLOUD_SQL_TIER_ALLOWLIST.join(', ')}.`,
    };
}

/** Pure. */
export function decideHighAvailability(
    mode: ProvisionGateMode,
    requestedHa: unknown,
    tier: Tier,
    minPlan: TierType
): GateDecision {
    if (mode === 'off' || requestedHa !== true) return { mode, blocked: false };
    if (PLAN_RANK[tier.id] >= PLAN_RANK[minPlan]) return { mode, blocked: false };

    return {
        mode,
        blocked: mode === 'enforce',
        violation: 'highAvailability',
        status: 403,
        message: `High availability requires the ${minPlan} plan or above. Please upgrade your plan.`,
    };
}

/** Pure. `provisionedCount === null` means the count failed -> fail open. */
export function decideProvisionQuota(
    mode: ProvisionGateMode,
    tier: Tier,
    provisionedCount: number | null,
    quota: number
): GateDecision {
    if (mode === 'off') return { mode, blocked: false };
    if (quota === Infinity || provisionedCount === null) return { mode, blocked: false };
    if (provisionedCount < quota) return { mode, blocked: false };

    return {
        mode,
        blocked: mode === 'enforce',
        violation: 'quota',
        status: 403,
        message:
            `Provisioning limit reached: your plan allows ${quota} managed instance(s) ` +
            `and you already have ${provisionedCount}. Please upgrade your plan or delete an unused instance.`,
    };
}

/** Pure. Counts instances Deployify provisioned into its own GCP project. */
export function countProvisionedInstances(
    projects: ReadonlyArray<Pick<Project, 'storageConfigs'>>
): number {
    let count = 0;
    for (const project of projects) {
        for (const storage of (project.storageConfigs || []) as StorageConfig[]) {
            if (!storage?.metadata?.provisioned) continue;
            if (!GCP_BILLED_STORAGE_TYPES.includes(storage.type)) continue;
            count++;
        }
    }
    return count;
}

/**
 * Owner-scoped count. Mirrors deploy-gate.ts, which also bills the project owner
 * (`checkUsageLimits(project.userId)`). Returns null on any failure so callers fail open.
 *
 * Known gap, called out deliberately: this counts projects where the subject is the
 * creator (`userId`), so instances other members provisioned inside a shared team are
 * not included. Team-wide accounting needs listProjectsByTeam() and is a follow-up.
 */
export async function countOwnerProvisionedInstances(ownerUserId: string): Promise<number | null> {
    if (process.env.MOCK_DB === 'true') return null;
    try {
        return countProvisionedInstances(await listProjectsByUser(ownerUserId));
    } catch (error) {
        console.error(`[ProvisionGate] instance count failed for owner ${ownerUserId}; allowing:`, error);
        return null;
    }
}

/**
 * Owner's plan, or null when the lookup failed. Deliberately NOT read from
 * session.user.subscription: that lives in a 7-day JWT, so a tenant who upgraded
 * yesterday still carries the old plan (or, on tokens issued before the field existed,
 * no plan at all) and would be gated as free. Null makes every plan-based check pass.
 */
export async function resolveOwnerTier(ownerUserId: string): Promise<Tier | null> {
    try {
        return await getUserTier(ownerUserId);
    } catch (error) {
        console.error(`[ProvisionGate] tier lookup failed for owner ${ownerUserId}; allowing:`, error);
        return null;
    }
}

export interface ProvisionGateInput {
    /** project.userId - the account the instances are billed to. */
    ownerUserId: string;
    storageType: string;
    requestedTier?: unknown;
    /** Tier already persisted on this config. Undefined on create. */
    currentTier?: unknown;
    requestedHighAvailability?: unknown;
    /** True for POST with provision=true (adds an instance), false for PATCH (scales one). */
    createsNewInstance: boolean;
}

/**
 * Single entry point for the route. Never throws.
 */
export async function checkStorageProvisionGate(input: ProvisionGateInput): Promise<GateDecision> {
    const mode = getProvisionGateMode();
    if (mode === 'off') return { mode, blocked: false };

    if (!GCP_BILLED_STORAGE_TYPES.includes(input.storageType)) {
        return { mode, blocked: false };
    }

    const isCloudSql = input.storageType.startsWith('cloud-sql');

    // Plan-independent and free: run it before touching Firestore.
    if (isCloudSql) {
        const tierDecision = decideCloudSqlTier(
            mode,
            input.requestedTier,
            input.currentTier,
            getCloudSqlTierAllowlist()
        );
        if (tierDecision.violation) return report(tierDecision, input);
    }

    // Only pay for the owner lookup when a plan-based check can actually fire.
    const haMinPlan = getHighAvailabilityMinPlan();
    const haRelevant = isCloudSql && input.requestedHighAvailability === true && haMinPlan !== 'free';
    if (!haRelevant && !input.createsNewInstance) return { mode, blocked: false };

    const tier = await resolveOwnerTier(input.ownerUserId);
    if (!tier) return { mode, blocked: false };

    if (haRelevant) {
        const haDecision = decideHighAvailability(mode, input.requestedHighAvailability, tier, haMinPlan);
        if (haDecision.violation) return report(haDecision, input);
    }

    if (!input.createsNewInstance) return { mode, blocked: false };

    const quota = getProvisionQuota(tier);
    if (quota === Infinity) return { mode, blocked: false };

    const count = await countOwnerProvisionedInstances(input.ownerUserId);
    const quotaDecision = decideProvisionQuota(mode, tier, count, quota);
    if (quotaDecision.violation) return report(quotaDecision, input);

    return { mode, blocked: false };
}

function report(decision: GateDecision, input: ProvisionGateInput): GateDecision {
    console.warn(
        `[ProvisionGate] owner=${input.ownerUserId} type=${input.storageType} ` +
        `violation=${decision.violation} blocked=${decision.blocked} ` +
        `mode=${decision.mode} detail=${decision.message}`
    );
    return decision;
}
