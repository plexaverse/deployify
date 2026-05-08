import { test } from 'node:test';
import assert from 'node:assert';
import { predictResourceExhaustion, calculateReliabilityScore, checkSLOViolations } from './monitoring';
import { ResourceMetrics } from './monitoring';
import { HealthResult } from './storage-validator';

test('Reliability Engineering Logic', async (t) => {
    await t.test('predictResourceExhaustion should forecast capacity breach', () => {
        const historicalMetrics: ResourceMetrics[] = [
            { cpuUtilization: 10, memoryUtilization: 20, timestamp: '1' },
            { cpuUtilization: 20, memoryUtilization: 25, timestamp: '2' },
            { cpuUtilization: 30, memoryUtilization: 30, timestamp: '3' },
            { cpuUtilization: 40, memoryUtilization: 35, timestamp: '4' },
            { cpuUtilization: 50, memoryUtilization: 40, timestamp: '5' },
        ];

        // CPU is increasing by 10% per point (hour)
        // From 50%, it needs 50% more to hit 100%
        // That should be 5 more points (hours)
        // 5 / 24 = 0.208... => 0.2 days
        const days = predictResourceExhaustion(historicalMetrics, 'cpu');
        assert.strictEqual(days, 0.2);

        // Memory is increasing by 5% per point
        // From 40%, it needs 60% more to hit 100%
        // That should be 12 more points
        // 12 / 24 = 0.5 days
        const memDays = predictResourceExhaustion(historicalMetrics, 'memory');
        assert.strictEqual(memDays, 0.5);
    });

    await t.test('predictResourceExhaustion should return -1 for stable/declining usage', () => {
        const historicalMetrics: ResourceMetrics[] = [
            { cpuUtilization: 50, memoryUtilization: 40, timestamp: '1' },
            { cpuUtilization: 40, memoryUtilization: 40, timestamp: '2' },
            { cpuUtilization: 30, memoryUtilization: 40, timestamp: '3' },
            { cpuUtilization: 20, memoryUtilization: 40, timestamp: '4' },
            { cpuUtilization: 10, memoryUtilization: 40, timestamp: '5' },
        ];

        assert.strictEqual(predictResourceExhaustion(historicalMetrics, 'cpu'), -1);
        assert.strictEqual(predictResourceExhaustion(historicalMetrics, 'memory'), -1);
    });

    await t.test('calculateReliabilityScore should quantify health state', () => {
        const healthHistory: HealthResult[] = [
            { status: 'healthy', latency: 100, timestamp: '1' },
            { status: 'healthy', latency: 120, timestamp: '2' },
            { status: 'degraded', latency: 600, timestamp: '3' }, // SLO violation (> 500ms)
            { status: 'unhealthy', latency: 0, timestamp: '4', error: 'Timeout' }, // Availability violation
            { status: 'healthy', latency: 110, timestamp: '5' },
        ];

        const metrics = calculateReliabilityScore(healthHistory, { uptime: 99.9, p99Latency: 500 });

        assert.strictEqual(metrics.uptime, 80); // 4/5 were healthy/degraded
        assert.strictEqual(metrics.sloViolations, 2); // 1 unhealthy, 1 latency > 500
        assert.ok(metrics.score < 100);
        assert.ok(metrics.score > 0);
    });

    await t.test('checkSLOViolations should detect saturation risks', () => {
        const metrics: ResourceMetrics = {
            cpuUtilization: 95,
            memoryUtilization: 40,
            timestamp: 'now'
        };

        const risk = checkSLOViolations({} as import('@/types').StorageConfig, metrics, []);
        assert.ok(risk);
        assert.strictEqual(risk.resource, 'cpu');
        assert.strictEqual(risk.hasRisk, true);
    });
});
