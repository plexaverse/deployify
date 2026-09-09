import { getUserById } from '@/lib/db';
import { resolveEffectiveTierId, toDateOrNull } from './entitlement';
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
    priceId: string;
    price: number; // in INR
    limits: TierLimits;
}

export const TIERS: Record<TierType, Tier> = {
    free: {
        id: 'free',
        name: 'Free',
        priceId: '',
        price: 0,
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
        priceId: 'price_pro_test',
        price: 1500, // 1500 INR
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
        priceId: 'price_team_test',
        price: 5000, // 5000 INR
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
        priceId: 'price_enterprise_test',
        price: 15000, // 15000 INR
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
    const subscription = user?.subscription;

    // Legacy guard, kept verbatim in behaviour: `expiresAt` in the past means free.
    // No writer has ever set this field on a real subscription (both producers write
    // `currentPeriodEnd`), so it is dead for production data - but it is live for the
    // dev MOCK_USER shape, and dropping it silently would be a behaviour change.
    const legacyExpiresAt = toDateOrNull(subscription?.expiresAt);
    if (legacyExpiresAt && legacyExpiresAt < new Date()) {
        return TIER_LIMITS['free'];
    }

    // The real check: reads `currentPeriodEnd` too. Inert unless
    // BILLING_ENTITLEMENT_MODE=enforce. getTier() also gives us the free fallback for
    // a corrupt tier string, where TIER_LIMITS[tierId] used to return undefined.
    return getTier(resolveEffectiveTierId(subscription, user?.id || 'unknown')).limits;
}

export async function getUserTierLimits(userId: string): Promise<TierLimits> {
    const user = await getUserById(userId);
    return calculateTierLimits(user);
}
