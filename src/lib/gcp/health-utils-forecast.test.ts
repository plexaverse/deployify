import test from 'node:test';
import assert from 'node:assert';
import { forecastLatency } from './health-utils';

test('forecastLatency', async (t) => {
    await t.test('should return current latency if history is too short', () => {
        const history = [100, 110];
        const result = forecastLatency(history);
        assert.strictEqual(result.predicted, 110);
        assert.strictEqual(result.jitter, 0);
    });

    await t.test('should forecast linear trend correctly', () => {
        const history = [100, 110, 120, 130, 140];
        const result = forecastLatency(history);
        // Linear trend: n=5, slope=10, intercept=100.
        // Next point (index 5): 10 * 5 + 100 = 150
        assert.strictEqual(result.predicted, 150);
        assert.ok(result.jitter > 0);
    });

    await t.test('should handle decreasing trend', () => {
        const history = [150, 140, 130, 120, 110];
        const result = forecastLatency(history);
        assert.strictEqual(result.predicted, 100);
    });

    await t.test('should handle high jitter', () => {
        const history = [100, 500, 100, 500, 100];
        const result = forecastLatency(history);
        // High variance relative to mean should result in jitter > 0.5
        assert.ok(result.jitter > 0.5);
    });
});
