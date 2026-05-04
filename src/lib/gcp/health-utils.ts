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

/**
 * Forecasts future latency based on historical trend
 * @param historicalLatencies Array of historical latency measurements
 * @returns Predicted latency and jitter score
 */
export function forecastLatency(historicalLatencies: number[]): { predicted: number; jitter: number } {
    if (historicalLatencies.length < 3) {
        const current = historicalLatencies[historicalLatencies.length - 1] || 0;
        return { predicted: current, jitter: 0 };
    }

    // Simple Linear Trend over last 5 points
    const points = historicalLatencies.slice(-5);
    const n = points.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += points[i];
        sumXY += i * points[i];
        sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predicted is the next point in the trend
    const predicted = Math.max(0, slope * n + intercept);

    // Jitter is the standard deviation relative to mean
    const mean = sumY / n;
    const variance = points.reduce((acc, p) => acc + Math.pow(p - mean, 2), 0) / n;
    const jitter = Math.sqrt(variance) / (mean || 1);

    return { predicted, jitter };
}
