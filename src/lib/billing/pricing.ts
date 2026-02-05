import { getUserById } from '@/lib/db';
import { getUsage } from './tracker';
import { getTierLimits, SubscriptionTier } from './tiers';
import { calculateOverageFromData, OverageCharges } from './pricing-utils';

export * from './pricing-utils';

/**
 * Calculates extra charges based on usage beyond tier limits.
 * @param userId The user ID to calculate charges for.
 */
export async function calculateOverageCharges(userId: string): Promise<OverageCharges> {
    const user = await getUserById(userId);
    const tier = (user?.subscription?.tier || 'free') as SubscriptionTier;

    const usage = await getUsage(userId);
    const limits = getTierLimits(tier);

    return calculateOverageFromData(usage, limits);
}
