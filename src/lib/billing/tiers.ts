import { getUserById } from '@/lib/db';
import type { User } from '@/types';

export type TierType = 'free' | 'pro' | 'team' | 'enterprise';
export type SubscriptionTier = TierType; // Alias for backward compatibility

export interface TierLimits {
    projects: number;
    deployments: number;
    buildMinutes: number;
    bandwidth: number; // in bytes
}

export interface UsageLimits {
    deployments: number; // per month
    buildMinutes: number; // per month
    bandwidth: number; // GB per month
}

export interface Tier {
    id: TierType;
    name: string;
    limits: TierLimits;
}

export const TIERS: Record<TierType, Tier> = {
    free: {
        id: 'free',
        name: 'Free',
        limits: {
            projects: 3,
            deployments: 20,
            buildMinutes: 100,
            bandwidth: 5 * 1024 * 1024 * 1024, // 5 GB
        }
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        limits: {
            projects: 10,
            deployments: 1000,
            buildMinutes: 1000,
            bandwidth: 100 * 1024 * 1024 * 1024, // 100 GB
        }
    },
    team: {
        id: 'team',
        name: 'Team',
        limits: {
            projects: 50,
            deployments: 5000,
            buildMinutes: 5000,
            bandwidth: 500 * 1024 * 1024 * 1024, // 500 GB
        }
    },
    enterprise: {
        id: 'enterprise',
        name: 'Enterprise',
        limits: {
            projects: Infinity,
            deployments: Infinity,
            buildMinutes: Infinity,
            bandwidth: Infinity,
        }
    }
};

export const DEFAULT_TIER = TIERS.free;

// Legacy TIER_LIMITS for backward compatibility
export const TIER_LIMITS: Record<TierType, TierLimits> = Object.fromEntries(
    Object.entries(TIERS).map(([key, tier]) => [key, tier.limits])
) as Record<TierType, TierLimits>;

export function getTier(tierId?: string): Tier {
    if (!tierId) return DEFAULT_TIER;
    const tier = TIERS[tierId as TierType];
    return tier || DEFAULT_TIER;
}

export function getTierLimits(tier: SubscriptionTier = 'free'): UsageLimits {
    const tierData = TIERS[tier];
    return {
        deployments: tierData.limits.deployments,
        buildMinutes: tierData.limits.buildMinutes,
        bandwidth: tierData.limits.bandwidth / (1024 * 1024 * 1024), // Convert to GB
    };
}

export function checkUsageLimits(
    tier: SubscriptionTier,
    metric: keyof UsageLimits,
    currentUsage: number
): boolean {
    const limits = getTierLimits(tier);
    return currentUsage < limits[metric];
}

export function calculateTierLimits(user: User | null): TierLimits {
    const tierId = (user as User & { subscription?: { tier?: TierType; expiresAt?: Date } })?.subscription?.tier || 'free';

    // Check if subscription is expired
    const subscription = (user as User & { subscription?: { tier?: TierType; expiresAt?: Date } })?.subscription;
    if (subscription?.expiresAt && subscription.expiresAt < new Date()) {
        return TIER_LIMITS['free'];
    }

    return TIER_LIMITS[tierId];
}

export async function getUserTierLimits(userId: string): Promise<TierLimits> {
    const user = await getUserById(userId);
    return calculateTierLimits(user);
}
