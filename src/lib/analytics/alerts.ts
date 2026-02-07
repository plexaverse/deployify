import { AnalyticsStats } from '@/types';

export interface PerformanceAlert {
    id: string;
    type: 'warning' | 'critical';
    metric: string;
    value: number;
    threshold: number;
    message: string;
    timestamp: Date;
}

export function evaluatePerformance(stats: AnalyticsStats): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    const { performance } = stats;

    if (!performance) return alerts;

    // LCP Thresholds: > 2.5s (Warning), > 4s (Critical)
    if (performance.lcp > 4000) {
        alerts.push({
            id: `lcp-crit-${Date.now()}`,
            type: 'critical',
            metric: 'LCP',
            value: performance.lcp,
            threshold: 4000,
            message: 'Critical: Largest Contentful Paint is very high (> 4s).',
            timestamp: new Date(),
        });
    } else if (performance.lcp > 2500) {
        alerts.push({
            id: `lcp-warn-${Date.now()}`,
            type: 'warning',
            metric: 'LCP',
            value: performance.lcp,
            threshold: 2500,
            message: 'Warning: Largest Contentful Paint needs improvement (> 2.5s).',
            timestamp: new Date(),
        });
    }

    // CLS Thresholds: > 0.1 (Warning), > 0.25 (Critical)
    if (performance.cls > 0.25) {
        alerts.push({
            id: `cls-crit-${Date.now()}`,
            type: 'critical',
            metric: 'CLS',
            value: performance.cls,
            threshold: 0.25,
            message: 'Critical: Cumulative Layout Shift is poor (> 0.25).',
            timestamp: new Date(),
        });
    } else if (performance.cls > 0.1) {
        alerts.push({
            id: `cls-warn-${Date.now()}`,
            type: 'warning',
            metric: 'CLS',
            value: performance.cls,
            threshold: 0.1,
            message: 'Warning: Cumulative Layout Shift needs improvement (> 0.1).',
            timestamp: new Date(),
        });
    }

    // TTFB Thresholds: > 800ms (Warning), > 1.8s (Critical)
    if (performance.ttfb > 1800) {
        alerts.push({
            id: `ttfb-crit-${Date.now()}`,
            type: 'critical',
            metric: 'TTFB',
            value: performance.ttfb,
            threshold: 1800,
            message: 'Critical: Server response time (TTFB) is very slow.',
            timestamp: new Date(),
        });
    }

    return alerts;
}
