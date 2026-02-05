import { getUserById } from '@/lib/db';
import type { User } from '@/types';

export type Tier = 'free' | 'pro' | 'team' | 'enterprise';

export interface TierLimits {
    projects: number;
    bandwidth: number; // in GB
    buildMinutes: number;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
    free: {
        projects: 3,
        bandwidth: 5, // 5 GB
        buildMinutes: 100,
    },
    pro: {
        projects: 10,
        bandwidth: 50, // 50 GB
        buildMinutes: 500,
    },
    team: {
        projects: 50,
        bandwidth: 200, // 200 GB
        buildMinutes: 2000,
    },
    enterprise: {
        projects: Infinity,
        bandwidth: Infinity,
        buildMinutes: Infinity,
    },
};

export function calculateTierLimits(user: User | null): TierLimits {
    const tier = user?.subscription?.tier || 'free';

    // Check if subscription is expired
    if (user?.subscription?.expiresAt && user.subscription.expiresAt < new Date()) {
        return TIER_LIMITS['free'];
    }

    return TIER_LIMITS[tier];
}

export async function getUserTierLimits(userId: string): Promise<TierLimits> {
    const user = await getUserById(userId);
    return calculateTierLimits(user);
}
