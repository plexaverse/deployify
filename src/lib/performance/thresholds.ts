export type MetricStatus = 'good' | 'average' | 'poor';

export function getLCPStatus(value: number): MetricStatus {
    if (value <= 2500) return 'good';
    if (value <= 4000) return 'average';
    return 'poor';
}

export function getFIDStatus(value: number): MetricStatus {
    if (value <= 100) return 'good';
    if (value <= 300) return 'average';
    return 'poor';
}

export function getCLSStatus(value: number): MetricStatus {
    if (value <= 0.1) return 'good';
    if (value <= 0.25) return 'average';
    return 'poor';
}

export function getScoreStatus(value: number): MetricStatus {
    // Value is 0-1
    if (value >= 0.9) return 'good';
    if (value >= 0.5) return 'average';
    return 'poor';
}
