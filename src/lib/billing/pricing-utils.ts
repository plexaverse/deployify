import { Usage } from './tracker';
import { UsageLimits } from './tiers';

// Pricing rates (in INR)
export const PRICING_RATES = {
    bandwidth: 5, // ₹5 per GB
    buildMinutes: 0.5, // ₹0.5 per minute
};

export interface OverageCharges {
    bandwidthOverage: number; // in GB
    bandwidthCost: number; // in INR
    buildMinutesOverage: number;
    buildMinutesCost: number; // in INR
    totalCost: number; // in INR
}

/**
 * pure logic helper to calculate overage
 * @param usage Current usage (bandwidth in bytes)
 * @param limits Tier limits (bandwidth in GB)
 */
export function calculateOverageFromData(usage: Usage, limits: UsageLimits): OverageCharges {
    // Convert usage bandwidth from bytes to GB
    const usageBandwidthGB = usage.bandwidth / (1024 * 1024 * 1024);

    // Calculate overages (ensure non-negative)
    // If limit is Infinity, overage is 0
    const bandwidthOverage = limits.bandwidth === Infinity
        ? 0
        : Math.max(0, usageBandwidthGB - limits.bandwidth);

    const buildMinutesOverage = limits.buildMinutes === Infinity
        ? 0
        : Math.max(0, usage.buildMinutes - limits.buildMinutes);

    // Calculate costs
    const bandwidthCost = bandwidthOverage * PRICING_RATES.bandwidth;
    const buildMinutesCost = buildMinutesOverage * PRICING_RATES.buildMinutes;

    return {
        bandwidthOverage,
        bandwidthCost,
        buildMinutesOverage,
        buildMinutesCost,
        totalCost: bandwidthCost + buildMinutesCost
    };
}
