/**
 * Absolute, plan-independent ceiling on the Cloud Run autoscaler bounds Deployify hands
 * to `gcloud run deploy`.
 *
 * src/lib/gcp/cloudbuild.ts passes project.resources.minInstances / .maxInstances
 * straight through to `--min-instances` / `--max-instances`. The only place that writes
 * those values (PATCH src/app/api/projects/[id]/route.ts) allowlists `cpu` and `memory`
 * but checks the instance counts only for `min >= 0`, `max > 0` and `max >= min`, so any
 * tenant can pin an unbounded number of always-on instances. Every tenant deploys into
 * ONE shared GCP project (config.gcp.projectId), so the regional CPU quota is shared:
 * one tenant burning it fails every other tenant's deploy. That makes this a
 * cross-tenant availability control, not only a billing one.
 *
 * Enforcement here is a CLAMP, never an error. A deploy that succeeds today must keep
 * succeeding; lowering an absurd bound to a working one is strictly safer than making
 * `gcloud run deploy` fail. It ships behind COMPUTE_LIMIT_MODE:
 *
 *   'off'     - kill switch. Values pass through untouched and nothing is logged.
 *   'audit'   - DEFAULT. Byte-for-byte today's behaviour; over-ceiling values are only
 *               logged, so operators can size the real blast radius before enforcing.
 *   'enforce' - numeric values above the ceiling are lowered to the ceiling.
 *
 * Absent, non-numeric or in-range values are returned untouched in every mode: the
 * historical fallbacks in cloudbuild.ts must keep producing the exact same argv.
 */

export type ComputeLimitMode = 'off' | 'audit' | 'enforce';

/** Deliberately generous: above anything the dashboard offers, below anything abusive. */
export const DEFAULT_MIN_INSTANCES_CEILING = 10;
export const DEFAULT_MAX_INSTANCES_CEILING = 100;

export function getComputeLimitMode(): ComputeLimitMode {
    const raw = (process.env.COMPUTE_LIMIT_MODE || '').trim().toLowerCase();
    if (raw === 'off' || raw === 'enforce') return raw;
    return 'audit';
}

function ceilingFromEnv(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Ops safety valve: raise either ceiling for one environment without a deploy. */
export function getInstanceCeilings(): { min: number; max: number } {
    return {
        min: ceilingFromEnv('COMPUTE_MIN_INSTANCES_CEILING', DEFAULT_MIN_INSTANCES_CEILING),
        max: ceilingFromEnv('COMPUTE_MAX_INSTANCES_CEILING', DEFAULT_MAX_INSTANCES_CEILING),
    };
}

export interface ClampedBounds {
    /** The value to render into argv. Identical to the input unless `clamped` is true. */
    min: number | string;
    max: number | string;
    clamped: boolean;
}

/**
 * Pure. Never throws, never widens a bound, and only ever narrows one in 'enforce'.
 */
export function clampInstanceBounds(
    min: number | string,
    max: number | string,
    mode: ComputeLimitMode,
    ceilings: { min: number; max: number },
    context: string
): ClampedBounds {
    if (mode === 'off') return { min, max, clamped: false };

    const numericMin = typeof min === 'number' ? min : Number(min);
    const numericMax = typeof max === 'number' ? max : Number(max);

    // A non-numeric value is left exactly as it is: cloudbuild.ts has always sent it
    // verbatim and gcloud, not this module, is the right place for that to fail.
    const minOver = Number.isFinite(numericMin) && numericMin > ceilings.min;
    const maxOver = Number.isFinite(numericMax) && numericMax > ceilings.max;

    if (!minOver && !maxOver) return { min, max, clamped: false };

    console.warn(
        `[ComputeLimits] ${context}: requested min=${String(min)} max=${String(max)} exceeds ` +
        `ceiling min=${ceilings.min} max=${ceilings.max} (mode=${mode})`
    );

    if (mode !== 'enforce') return { min, max, clamped: false };

    const clampedMax = maxOver ? ceilings.max : max;
    let clampedMin: number | string = minOver ? ceilings.min : min;

    // `max >= min` is a hard Cloud Run requirement. A misconfigured pair of ceilings
    // must never turn a working deploy into an API rejection.
    const finalMax = typeof clampedMax === 'number' ? clampedMax : Number(clampedMax);
    if (typeof clampedMin === 'number' && Number.isFinite(finalMax) && clampedMin > finalMax) {
        clampedMin = finalMax;
    }

    return { min: clampedMin, max: clampedMax, clamped: true };
}
