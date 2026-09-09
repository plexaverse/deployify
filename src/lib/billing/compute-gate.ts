/**
 * Plan gate for the Cloud Run autoscaler bounds a tenant may ask for.
 *
 * PATCH src/app/api/projects/[id]/route.ts allowlists `resources.cpu` (1/2/4) and
 * `resources.memory` (256Mi..4Gi) but checks `minInstances` / `maxInstances` only for
 * `min >= 0`, `max > 0` and `max >= min`. src/lib/gcp/cloudbuild.ts then passes both
 * straight to `gcloud run deploy`. A free-tier tenant can therefore persist
 * `{cpu: 4, memory: '4Gi', minInstances: 1000, maxInstances: 1000}` and ask for a
 * thousand always-on 4 vCPU instances. Cloud Run's own quota stops it from actually
 * provisioning, but because every tenant shares ONE GCP project
 * (src/lib/config.ts, config.gcp.projectId) burning the regional CPU quota fails every
 * other tenant's deploy - so this is a cross-tenant availability control as well as a
 * cost one.
 *
 * src/lib/gcp/instance-limits.ts holds the absolute, plan-independent ceiling applied at
 * deploy time (a clamp, so already-stored oversized values are neutralised without a
 * migration). THIS module holds the per-plan caps applied at write time, where the
 * owner's plan is knowable.
 *
 * Shares COMPUTE_LIMIT_MODE with instance-limits.ts:
 *
 *   'off'     - no check at all. Kill switch; zero extra reads.
 *   'audit'   - DEFAULT. Exactly today's behaviour: violations are logged, nothing is
 *               ever blocked, so operators can size the blast radius first.
 *   'enforce' - the PATCH is rejected before anything is written.
 *
 * Non-breaking by construction:
 *   - A value equal to or below what is ALREADY stored on the project is always allowed.
 *     ResourceSettings.tsx re-submits all four fields on every save, so a tenant who is
 *     already above a cap can still edit memory/CPU and can still scale down. Only an
 *     increase past the cap is ever a violation.
 *   - The free-tier caps are the tightest, so a request within them cannot violate any
 *     plan: that short-circuits before the owner lookup and the common path costs
 *     nothing extra.
 *   - Skipped entirely under MOCK_DB so local dev keeps working with any flag value.
 *   - Every failure path allows the request. A billing or Firestore outage must never
 *     stop a paying tenant from saving settings.
 */
import { config } from '@/lib/config';
import { getComputeLimitMode, type ComputeLimitMode } from '@/lib/gcp/instance-limits';
import { resolveOwnerTier } from './provision-gate';
import { TIERS, type Tier, type TierType } from './tiers';

/** Same loose shape the PATCH route already casts the body to. */
export interface RequestedResources {
    cpu?: number | string;
    memory?: string;
    minInstances?: number | string;
    maxInstances?: number | string;
}

export interface InstanceCaps {
    /** Highest `minInstances` (always-on instances) this plan may request. */
    minInstances: number;
    /** Highest `maxInstances` (autoscaler ceiling) this plan may request. */
    maxInstances: number;
    /** Highest always-on vCPU (minInstances x cpu) this plan may pin. The real cost driver. */
    alwaysOnVcpu: number;
}

/** Deliberately generous. Free is the tightest set, which the short-circuit relies on. */
export const INSTANCE_CAPS: Record<TierType, InstanceCaps> = {
    free: { minInstances: 1, maxInstances: 10, alwaysOnVcpu: 2 },
    pro: { minInstances: 5, maxInstances: 50, alwaysOnVcpu: 20 },
    team: { minInstances: 20, maxInstances: 100, alwaysOnVcpu: 80 },
    enterprise: { minInstances: Infinity, maxInstances: Infinity, alwaysOnVcpu: Infinity },
};

export interface ComputeGateDecision {
    mode: ComputeLimitMode;
    /** True only in 'enforce'. In 'audit' a violation sets `violation` and leaves this false. */
    blocked: boolean;
    violation?: 'minInstances' | 'maxInstances' | 'alwaysOnVcpu';
    status?: number;
    message?: string;
}

function capFromEnv(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Ops safety valve, mirroring STORAGE_PROVISION_QUOTA_*: e.g.
 * COMPUTE_MAX_INSTANCES_CAP_FREE=25 unblocks a plan without a deploy.
 */
export function getInstanceCaps(tier: Tier): InstanceCaps {
    const base = INSTANCE_CAPS[tier.id] ?? INSTANCE_CAPS.free;
    const suffix = tier.id.toUpperCase();
    return {
        minInstances: capFromEnv(`COMPUTE_MIN_INSTANCES_CAP_${suffix}`, base.minInstances),
        maxInstances: capFromEnv(`COMPUTE_MAX_INSTANCES_CAP_${suffix}`, base.maxInstances),
        alwaysOnVcpu: capFromEnv(`COMPUTE_ALWAYS_ON_VCPU_CAP_${suffix}`, base.alwaysOnVcpu),
    };
}

/**
 * The values cloudbuild.ts will actually send for this resources object. `updateProject`
 * replaces the whole `resources` map, so an omitted field really does fall back to the
 * config default - exactly what generateCloudRunDeployConfig() does.
 */
export function effectiveBounds(resources?: RequestedResources): {
    min: number;
    max: number;
    cpu: number;
} {
    const min = resources?.minInstances !== undefined
        ? Number(resources.minInstances)
        : config.cloudRun.minInstances;
    const max = resources?.maxInstances !== undefined
        ? Number(resources.maxInstances)
        : config.cloudRun.maxInstances;
    const cpu = Number(resources?.cpu || config.cloudRun.cpu);
    return {
        min: Number.isFinite(min) ? min : 0,
        max: Number.isFinite(max) ? max : 0,
        cpu: Number.isFinite(cpu) ? cpu : 1,
    };
}

/** True when nothing in `requested` is an increase over `current`. Never a violation. */
export function isNonIncreasing(
    requested: RequestedResources,
    current?: RequestedResources
): boolean {
    const next = effectiveBounds(requested);
    const prev = effectiveBounds(current);
    return next.min <= prev.min
        && next.max <= prev.max
        && next.min * next.cpu <= prev.min * prev.cpu;
}

/**
 * Pure. `current` is what is already persisted on the project (undefined for a project
 * that never set resources).
 */
export function decideInstanceLimits(
    mode: ComputeLimitMode,
    requested: RequestedResources,
    current: RequestedResources | undefined,
    caps: InstanceCaps
): ComputeGateDecision {
    if (mode === 'off') return { mode, blocked: false };

    const next = effectiveBounds(requested);
    const prev = effectiveBounds(current);
    const blocked = mode === 'enforce';

    if (next.min > caps.minInstances && next.min > prev.min) {
        return {
            mode,
            blocked,
            violation: 'minInstances',
            status: 403,
            message:
                `Your plan allows up to ${caps.minInstances} always-on instance(s) ` +
                `(min instances); ${next.min} was requested. Please upgrade your plan.`,
        };
    }

    const nextAlwaysOn = next.min * next.cpu;
    if (nextAlwaysOn > caps.alwaysOnVcpu && nextAlwaysOn > prev.min * prev.cpu) {
        return {
            mode,
            blocked,
            violation: 'alwaysOnVcpu',
            status: 403,
            message:
                `Your plan allows up to ${caps.alwaysOnVcpu} always-on vCPU; ` +
                `${next.min} instance(s) x ${next.cpu} vCPU = ${nextAlwaysOn} was requested. ` +
                `Please upgrade your plan or lower min instances.`,
        };
    }

    if (next.max > caps.maxInstances && next.max > prev.max) {
        return {
            mode,
            blocked,
            violation: 'maxInstances',
            status: 403,
            message:
                `Your plan allows up to ${caps.maxInstances} max instances; ` +
                `${next.max} was requested. Please upgrade your plan.`,
        };
    }

    return { mode, blocked: false };
}

export interface ComputeGateInput {
    /** project.userId - the account the compute is billed to. Mirrors deploy-gate.ts. */
    ownerUserId: string;
    requested: RequestedResources;
    /** project.resources as already stored. Undefined when the project never set it. */
    current?: RequestedResources;
}

/**
 * Single entry point for the route. Never throws.
 */
export async function checkComputeResourceGate(input: ComputeGateInput): Promise<ComputeGateDecision> {
    const mode = getComputeLimitMode();
    if (mode === 'off') return { mode, blocked: false };

    try {
        // Local dev / unit runs: createMockFirestore() has no real subscriptions to read.
        if (process.env.MOCK_DB === 'true') return { mode, blocked: false };

        // Scaling down or standing still can never be a violation.
        if (isNonIncreasing(input.requested, input.current)) return { mode, blocked: false };

        // Free is the tightest cap set, so anything inside it is inside every plan. This
        // is the whole dashboard default path (min 0 / max 10 / 1 vCPU) - no owner lookup.
        const freeDecision = decideInstanceLimits(mode, input.requested, input.current, getInstanceCaps(TIERS.free));
        if (!freeDecision.violation) return { mode, blocked: false };

        const tier = await resolveOwnerTier(input.ownerUserId);
        if (!tier) return { mode, blocked: false };

        const decision = decideInstanceLimits(mode, input.requested, input.current, getInstanceCaps(tier));
        if (!decision.violation) return { mode, blocked: false };

        const next = effectiveBounds(input.requested);
        console.warn(
            `[ComputeGate] owner=${input.ownerUserId} plan=${tier.id} ` +
            `min=${next.min} max=${next.max} cpu=${next.cpu} ` +
            `violation=${decision.violation} blocked=${decision.blocked} mode=${mode}`
        );
        return decision;
    } catch (error) {
        // A settings save must never 500 because of this gate.
        console.error(`[ComputeGate] check failed for owner ${input.ownerUserId}; allowing:`, error);
        return { mode, blocked: false };
    }
}
