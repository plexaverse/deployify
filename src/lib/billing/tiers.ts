import { getUserById } from '@/lib/db';
import type { User } from '@/types';

export type TierType = 'free' | 'pro' | 'team' | 'enterprise';

export interface TierLimits {
    projects: number;
    deployments: number;
    buildMinutes: number;
    bandwidth: number; // in bytes
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
            deployments: 10,
            buildMinutes: 100,
            bandwidth: 5 * 1024 * 1024 * 1024, // 5 GB
        }
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        limits: {
            projects: 10,
            deployments: 100,
            buildMinutes: 500,
            bandwidth: 50 * 1024 * 1024 * 1024, // 50 GB
        }
    },
    team: {
        id: 'team',
        name: 'Team',
        limits: {
            projects: 50,
            deployments: 500,
            buildMinutes: 2000,
            bandwidth: 200 * 1024 * 1024 * 1024, // 200 GB
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
