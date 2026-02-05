export type SubscriptionTier = 'free' | 'pro';

export interface UsageLimits {
    deployments: number; // per month
    buildMinutes: number; // per month
    bandwidth: number; // GB per month
}

export const TIERS: Record<SubscriptionTier, UsageLimits> = {
    free: {
        deployments: 20,
        buildMinutes: 100,
        bandwidth: 5,
    },
    pro: {
        deployments: 1000,
        buildMinutes: 1000,
        bandwidth: 100,
    },
};

export function getTierLimits(tier: SubscriptionTier = 'free'): UsageLimits {
    return TIERS[tier];
}

export function checkUsageLimits(
    tier: SubscriptionTier,
    metric: keyof UsageLimits,
    currentUsage: number
): boolean {
    const limits = getTierLimits(tier);
    return currentUsage < limits[metric];
}
