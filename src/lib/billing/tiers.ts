export interface TierLimits {
    deployments: number;
    buildMinutes: number;
    bandwidth: number; // in bytes
}

export interface Tier {
    id: string;
    name: string;
    limits: TierLimits;
}

export const TIERS: Record<string, Tier> = {
    FREE: {
        id: 'free',
        name: 'Free',
        limits: {
            deployments: 10,
            buildMinutes: 100,
            bandwidth: 10 * 1024 * 1024 * 1024, // 10 GB
        }
    },
    PRO: {
        id: 'pro',
        name: 'Pro',
        limits: {
            deployments: 100,
            buildMinutes: 500,
            bandwidth: 100 * 1024 * 1024 * 1024, // 100 GB
        }
    }
};

export const DEFAULT_TIER = TIERS.FREE;

export function getTier(tierId?: string): Tier {
    if (!tierId) return DEFAULT_TIER;
    const tier = Object.values(TIERS).find(t => t.id === tierId);
    return tier || DEFAULT_TIER;
}
