/**
 * Usage-cap gate for git-triggered deployments.
 *
 * The manual route (src/app/api/projects/[id]/deploy/route.ts) has always called
 * checkUsageLimits() before submitting a Cloud Build. The GitHub webhook
 * (src/app/api/webhooks/github/route.ts) never did, so a plain `git push` - the
 * primary way deployments are triggered in this product - skipped the cap entirely.
 *
 * Closing that hole on a live system is a behaviour change for every tenant that is
 * currently over their cap, so it ships behind WEBHOOK_USAGE_CAP_MODE:
 *
 *   'off'     - no check at all. Kill switch; zero extra reads.
 *   'audit'   - DEFAULT. Exactly today's deploy behaviour. The usage lookup runs
 *               fire-and-forget (never awaited, never blocks) and only logs, so
 *               operators can size the blast radius before enforcing.
 *   'enforce' - the deployment is recorded as 'error' with the same message the
 *               manual route already returns, and no Cloud Build is submitted.
 *
 * Every failure path allows the deployment. A billing, Firestore or Cloud Monitoring
 * outage must never stop a paying tenant from shipping.
 */
import { checkUsageLimits, type CheckLimitResult } from './caps';
import { resolveEffectiveTierId } from './entitlement';
import { getTier, type Tier } from './tiers';
import { logAuditEvent } from '@/lib/audit';
import type { Project, User } from '@/types';

export type UsageCapMode = 'off' | 'audit' | 'enforce';

export interface GitDeployCapDecision {
    mode: UsageCapMode;
    blocked: boolean;
    limitType?: CheckLimitResult['limitType'];
    message?: string;
}

/** Extra fields written to the audit event. Never contains `undefined` (Firestore rejects it). */
export interface GitDeployCapContext {
    trigger: 'push' | 'pull_request';
    branch: string;
    commitSha: string;
    pullRequestNumber?: number;
}

export function getWebhookUsageCapMode(): UsageCapMode {
    const raw = (process.env.WEBHOOK_USAGE_CAP_MODE || '').trim().toLowerCase();
    if (raw === 'off' || raw === 'enforce') return raw;
    return 'audit';
}

/** True when no metric on this tier can ever be exceeded, so the usage query is pointless. */
export function isUnlimitedTier(tier: Tier): boolean {
    return (
        tier.limits.deployments === Infinity &&
        tier.limits.buildMinutes === Infinity &&
        tier.limits.bandwidth === Infinity
    );
}

/** Byte-identical to the string the manual /deploy route already returns. */
export function usageCapMessage(limitType: CheckLimitResult['limitType']): string {
    return `Usage limit exceeded: ${limitType}. Please upgrade your plan.`;
}

/**
 * Pure decision. `result === null` means the usage lookup failed -> fail open.
 */
export function decideGitDeployCap(
    mode: UsageCapMode,
    tier: Tier,
    result: CheckLimitResult | null
): GitDeployCapDecision {
    if (mode === 'off') return { mode, blocked: false };
    if (isUnlimitedTier(tier)) return { mode, blocked: false };
    if (!result || result.withinLimits) return { mode, blocked: false };

    return {
        mode,
        blocked: mode === 'enforce',
        limitType: result.limitType,
        message: usageCapMessage(result.limitType),
    };
}

/**
 * Audit mode exists to size the blast radius, not to do accounting, so one probe per
 * project per window is plenty. Without this a busy repo would fire a full
 * getMonthlyUsage() - one Firestore query per project plus one Cloud Monitoring call
 * per project - on every single push. Best-effort and per-instance by design;
 * 'enforce' mode is never throttled.
 */
export const AUDIT_PROBE_INTERVAL_MS = 15 * 60 * 1000;
const AUDIT_PROBE_MAX_TRACKED = 5000;
const lastAuditProbeAt = new Map<string, number>();

export function shouldRunAuditProbe(projectId: string, now: number = Date.now()): boolean {
    const last = lastAuditProbeAt.get(projectId);
    if (last !== undefined && now - last < AUDIT_PROBE_INTERVAL_MS) {
        return false;
    }

    lastAuditProbeAt.set(projectId, now);

    // Keep the map bounded on a long-lived instance.
    if (lastAuditProbeAt.size > AUDIT_PROBE_MAX_TRACKED) {
        for (const [key, timestamp] of lastAuditProbeAt) {
            if (now - timestamp >= AUDIT_PROBE_INTERVAL_MS) lastAuditProbeAt.delete(key);
        }
    }

    return true;
}

async function runCapProbe(
    project: Pick<Project, 'id' | 'userId' | 'teamId'>,
    tier: Tier,
    mode: UsageCapMode,
    context: GitDeployCapContext
): Promise<GitDeployCapDecision> {
    let result: CheckLimitResult | null = null;

    try {
        // Same call the manual /deploy route makes. The webhook has no session, so the
        // subject is the project owner - which is also whose projects getMonthlyUsage()
        // aggregates, so the number this compares against is the right one.
        result = await checkUsageLimits(project.userId);
    } catch (error) {
        console.error(`[UsageCap] usage lookup failed for project ${project.id}; allowing deployment:`, error);
    }

    const decision = decideGitDeployCap(mode, tier, result);

    if (!result || result.withinLimits) {
        return decision;
    }

    console.warn(
        `[UsageCap] project=${project.id} owner=${project.userId} mode=${mode} ` +
        `limit=${result.limitType} usage=${Math.round(result.usagePercentage)}% blocked=${decision.blocked}`
    );

    try {
        await logAuditEvent(project.teamId || null, project.userId, 'deployment.usage_limit', {
            ...context,
            projectId: project.id,
            limitType: result.limitType ?? null,
            usagePercentage: Math.round(result.usagePercentage),
            enforced: decision.blocked,
        });
    } catch (error) {
        console.error('[UsageCap] failed to record usage-limit audit event:', error);
    }

    return decision;
}

/**
 * Decide whether a webhook-triggered deployment may proceed.
 * Resolves to `blocked: false` in every mode except 'enforce', and in 'enforce' only
 * when the owner is genuinely over a cap.
 */
export async function checkGitDeployCap(
    project: Pick<Project, 'id' | 'userId' | 'teamId'>,
    user: Pick<User, 'subscription'>,
    context: GitDeployCapContext
): Promise<GitDeployCapDecision> {
    const mode = getWebhookUsageCapMode();
    // The webhook already loaded the owner, so the tier costs no extra read. This
    // mirrors getUserTier() in caps.ts exactly, entitlement check included - the two
    // must not disagree, or an over-cap tenant would be judged on a different plan
    // here than inside checkUsageLimits() one line later.
    const tier = getTier(resolveEffectiveTierId(user.subscription, project.userId));

    if (mode === 'off' || isUnlimitedTier(tier)) {
        return { mode, blocked: false };
    }

    if (mode === 'audit') {
        // Deliberately not awaited: audit mode must add zero latency to the webhook
        // response and must not touch control flow. Same fire-and-forget shape as
        // pollBuildStatus() in the webhook route.
        if (shouldRunAuditProbe(project.id)) {
            void runCapProbe(project, tier, mode, context).catch((error) => {
                console.error('[UsageCap] audit probe failed:', error);
            });
        }
        return { mode, blocked: false };
    }

    return runCapProbe(project, tier, mode, context);
}
