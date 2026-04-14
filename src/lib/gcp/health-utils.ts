/**
 * Utility functions for predictive health monitoring
 */

/**
 * Calculates the new baseline latency using Exponential Weighted Moving Average (EWMA)
 * @param currentLatency The latest measured latency
 * @param previousBaseline The previous baseline latency
 * @param alpha The smoothing factor (default 0.2)
 */
export function calculateEWMA(currentLatency: number, previousBaseline?: number, alpha = 0.2): number {
    if (previousBaseline === undefined || previousBaseline <= 0) {
        return currentLatency;
    }
    return (alpha * currentLatency) + ((1 - alpha) * previousBaseline);
}

/**
 * Determines if a resource is degraded based on its latency and baseline
 * @param latency Current measured latency
 * @param baseline Baseline latency
 * @param threshold Multiplier threshold (default 2x)
 * @param minDelta Minimum difference in ms to trigger degradation (default 100ms)
 */
export function isDegraded(latency: number, baseline?: number, threshold = 2, minDelta = 100): boolean {
    if (baseline === undefined || baseline <= 0) return false;
    return latency > baseline * threshold && (latency - baseline) > minDelta;
}
