import { getUsage, Usage } from './tracker';
import { getTier, Tier, DEFAULT_TIER } from './tiers';
import { resolveEffectiveTierId } from './entitlement';
import { getUserById } from '@/lib/db';

export interface CheckLimitResult {
    withinLimits: boolean;
    usagePercentage: number;
    limitType?: 'deployments' | 'buildMinutes' | 'bandwidth';
}

/**
 * Calculates usage limits status based on usage and tier
 */
export function calculateLimitStatus(usage: Usage, tier: Tier): CheckLimitResult {
    const deploymentUsage = (usage.deployments / tier.limits.deployments) * 100;
    const buildTimeUsage = (usage.buildMinutes / tier.limits.buildMinutes) * 100;
    const bandwidthUsage = (usage.bandwidth / tier.limits.bandwidth) * 100;

    const maxUsage = Math.max(deploymentUsage, buildTimeUsage, bandwidthUsage);

    let limitType: CheckLimitResult['limitType'];

    if (deploymentUsage >= 100) limitType = 'deployments';
    else if (buildTimeUsage >= 100) limitType = 'buildMinutes';
    else if (bandwidthUsage >= 100) limitType = 'bandwidth';

    return {
        withinLimits: maxUsage < 100,
        usagePercentage: maxUsage,
        limitType
    };
}

/**
 * Retrieves the subscription tier for a given user.
 *
 * This is the choke point every usage gate goes through (checkUsageLimits, and
 * resolveOwnerTier() in provision-gate.ts, which compute-gate.ts also uses), so the
 * entitlement check lives here. Under BILLING_ENTITLEMENT_MODE=off|audit (the default)
 * this returns exactly what it returned before: the stored tier.
 */
export async function getUserTier(userId: string): Promise<Tier> {
    const user = await getUserById(userId);
    if (!user) return DEFAULT_TIER;
    return getTier(resolveEffectiveTierId(user.subscription, userId));
}

export async function checkUsageLimits(userId: string): Promise<CheckLimitResult> {
    const usage = await getUsage(userId);
    const tier = await getUserTier(userId);
    return calculateLimitStatus(usage, tier);
}
