/**
 * Subscription entitlement: "is this paid plan still actually paid for?".
 *
 * The only expiry check that ever existed (calculateTierLimits() in tiers.ts) read
 * `subscription.expiresAt`, a field no writer has ever set: both producers
 * (/api/billing/verify and /api/billing/webhook) write `currentPeriodEnd`. So the
 * guard was dead code and every enforcement path - checkUsageLimits(), the webhook
 * deploy gate, the provision gate, the compute gate - resolved the tier straight from
 * `subscription.tier`, forever.
 *
 * Turning expiry on for a live tenant base is a behaviour change, so it ships behind
 * BILLING_ENTITLEMENT_MODE:
 *
 *   'off'     - kill switch. Raw stored tier, exactly as today. Forced on for MOCK_DB.
 *   'audit'   - DEFAULT. Raw stored tier (today's behaviour), but a lapse is logged so
 *               operators can size the blast radius before enforcing.
 *   'enforce' - a lapsed paid plan resolves to 'free'.
 *
 * Deliberately conservative rules, so no existing tenant can be downgraded by accident:
 *   - No usable period end on the document  -> NEVER lapsed. Every legacy doc, every
 *     hand-granted enterprise account and every subscription written before
 *     currentPeriodEnd existed keeps its tier.
 *   - 'free' never lapses (there is nothing below it).
 *   - A period end is honoured only after a grace window (BILLING_ENTITLEMENT_GRACE_DAYS,
 *     default 3) so one missed Razorpay redelivery does not cut a paying tenant off.
 *   - status 'canceled'/'unpaid' revokes only once the paid period has actually ended -
 *     a cancellation mid-cycle keeps access to the end of the cycle, which is what the
 *     customer paid for. 'past_due' never revokes on its own.
 *
 * Pure and dependency-free on purpose: no Firestore, no tiers.ts runtime import (the
 * TierType import is type-only, so there is no import cycle with tiers.ts).
 */
import type { TierType } from './tiers';

export type EntitlementMode = 'off' | 'audit' | 'enforce';

export type LapseReason = 'period_ended' | 'canceled' | 'unpaid';

/**
 * The subscription as it actually reaches us. Dates are `unknown` because the same
 * object arrives in three different encodings:
 *   - a real Date            (getUserById() converts `expiresAt`, and freshly written objects)
 *   - a Firestore Timestamp  (getUserById() does NOT convert `currentPeriodEnd`)
 *   - an ISO string or {_seconds} (round-tripped through a session JWT)
 */
export interface SubscriptionLike {
    tier?: string;
    status?: string;
    expiresAt?: unknown;
    currentPeriodEnd?: unknown;
}

export interface EntitlementDecision {
    mode: EntitlementMode;
    /** The tier stored on the document, normalised to 'free' when absent. */
    storedTier: TierType;
    /** What callers should actually bill/limit against. */
    effectiveTier: TierType;
    /** True when the stored paid plan is no longer paid for (regardless of mode). */
    lapsed: boolean;
    reason?: LapseReason;
    /** Latest end-of-access instant we could resolve, or null when the doc has none. */
    periodEnd: Date | null;
}

const DEFAULT_GRACE_DAYS = 3;
const MAX_GRACE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * BILLING_ENTITLEMENT_MODE. Defaults to 'audit' - the first deploy changes no outcome,
 * only observability. MOCK_DB local dev is forced 'off': createMockFirestore() has no
 * real subscription documents to reason about.
 */
export function getEntitlementMode(): EntitlementMode {
    if (process.env.MOCK_DB === 'true') return 'off';

    const raw = (process.env.BILLING_ENTITLEMENT_MODE || '').trim().toLowerCase();
    if (raw === 'off' || raw === 'enforce') return raw;
    return 'audit';
}

/** BILLING_ENTITLEMENT_GRACE_DAYS, clamped to [0, 90]. Garbage falls back to 3 days. */
export function getEntitlementGraceMs(): number {
    const raw = (process.env.BILLING_ENTITLEMENT_GRACE_DAYS || '').trim();
    if (!raw) return DEFAULT_GRACE_DAYS * DAY_MS;

    const days = Number(raw);
    if (!Number.isFinite(days) || days < 0) return DEFAULT_GRACE_DAYS * DAY_MS;
    return Math.min(days, MAX_GRACE_DAYS) * DAY_MS;
}

/**
 * Every date encoding this codebase can hand us -> Date, or null when it is not a
 * usable instant. Null is always the permissive answer: no date means no expiry.
 */
export function toDateOrNull(value: unknown): Date | null {
    if (value === null || value === undefined) return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number') {
        // Epoch seconds (Razorpay) vs epoch millis: anything below ~1e12 is seconds.
        const ms = Math.abs(value) < 1e12 ? value * 1000 : value;
        const asDate = new Date(ms);
        return Number.isNaN(asDate.getTime()) ? null : asDate;
    }

    if (typeof value === 'string') {
        const asDate = new Date(value);
        return Number.isNaN(asDate.getTime()) ? null : asDate;
    }

    if (typeof value === 'object') {
        const candidate = value as { toDate?: unknown; _seconds?: unknown; seconds?: unknown };

        // Firestore Timestamp instance.
        if (typeof candidate.toDate === 'function') {
            try {
                const asDate = (candidate.toDate as () => Date)();
                return asDate instanceof Date && !Number.isNaN(asDate.getTime()) ? asDate : null;
            } catch {
                return null;
            }
        }

        // A Timestamp that has been through JSON (session JWT, structured clone).
        const seconds = typeof candidate._seconds === 'number'
            ? candidate._seconds
            : typeof candidate.seconds === 'number' ? candidate.seconds : null;

        if (seconds !== null) {
            const asDate = new Date(seconds * 1000);
            return Number.isNaN(asDate.getTime()) ? null : asDate;
        }
    }

    return null;
}

/**
 * Dual-read: `currentPeriodEnd` is what the live writers set, `expiresAt` is what the
 * original (dead) guard and the dev MOCK_USER use. When both are present the LATER one
 * wins, so a document can only be treated as lapsed once every end-of-access signal on
 * it has passed.
 */
export function resolvePeriodEnd(subscription: SubscriptionLike | null | undefined): Date | null {
    if (!subscription) return null;

    const candidates = [
        toDateOrNull(subscription.currentPeriodEnd),
        toDateOrNull(subscription.expiresAt),
    ].filter((d): d is Date => d !== null);

    if (candidates.length === 0) return null;
    return candidates.reduce((latest, d) => (d > latest ? d : latest));
}

/** Pure. `mode` and `now` are injected so this is trivially testable. */
export function evaluateEntitlement(
    subscription: SubscriptionLike | null | undefined,
    mode: EntitlementMode,
    now: Date = new Date(),
    graceMs: number = getEntitlementGraceMs()
): EntitlementDecision {
    const storedTier = (subscription?.tier || 'free') as TierType;
    const periodEnd = resolvePeriodEnd(subscription);
    const base: EntitlementDecision = {
        mode,
        storedTier,
        effectiveTier: storedTier,
        lapsed: false,
        periodEnd,
    };

    // Nothing below free, and a doc with no end date can never be proven lapsed.
    if (storedTier === 'free' || periodEnd === null) return base;

    const status = subscription?.status;
    const terminated = status === 'canceled' || status === 'unpaid';

    // A cancellation still runs to the end of the paid period; only the period end
    // itself revokes. Grace applies to a plan that simply was not renewed.
    const cutoff = terminated ? periodEnd.getTime() : periodEnd.getTime() + graceMs;
    if (now.getTime() < cutoff) return base;

    const reason: LapseReason = status === 'canceled'
        ? 'canceled'
        : status === 'unpaid' ? 'unpaid' : 'period_ended';

    return {
        ...base,
        effectiveTier: mode === 'enforce' ? 'free' : storedTier,
        lapsed: true,
        reason,
    };
}

/**
 * The call-site helper. Reads the mode from the environment, logs a lapse once per
 * call, and returns the tier id to bill against. Never throws.
 *
 * `subject` is only used for the log line (a user id).
 */
export function resolveEffectiveTierId(
    subscription: SubscriptionLike | null | undefined,
    subject: string
): TierType {
    try {
        const mode = getEntitlementMode();
        if (mode === 'off') return (subscription?.tier || 'free') as TierType;

        const decision = evaluateEntitlement(subscription, mode);

        if (decision.lapsed) {
            console.warn(
                `[Entitlement] subject=${subject} mode=${mode} storedTier=${decision.storedTier} ` +
                `effectiveTier=${decision.effectiveTier} reason=${decision.reason} ` +
                `periodEnd=${decision.periodEnd?.toISOString()}`
            );
        }

        return decision.effectiveTier;
    } catch (error) {
        // Billing must never break a deploy. Fall back to the stored tier.
        console.error(`[Entitlement] evaluation failed for ${subject}; using stored tier:`, error);
        return (subscription?.tier || 'free') as TierType;
    }
}
