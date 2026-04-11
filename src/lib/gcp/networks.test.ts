import { test } from 'node:test';
import assert from 'node:assert';
import { getRegionalEgressIps } from './networks';

test('getRegionalEgressIps', async (t) => {
    await t.test('should return IPs for us-central1', () => {
        const result = getRegionalEgressIps('us-central1');
        assert.strictEqual(result.region, 'us-central1');
        assert.ok(result.ips.length > 0);
        assert.strictEqual(result.isFallback, undefined);
    });

    await t.test('should return IPs for europe-west1', () => {
        const result = getRegionalEgressIps('europe-west1');
        assert.strictEqual(result.region, 'europe-west1');
        assert.ok(result.ips.includes('35.205.0.0/16'));
    });

    await t.test('should fallback to us-central1 for unknown region', () => {
        const result = getRegionalEgressIps('unknown-region');
        assert.strictEqual(result.region, 'us-central1');
        assert.strictEqual(result.isFallback, true);
    });

    await t.test('should fallback for null region', () => {
        const result = getRegionalEgressIps(null);
        assert.strictEqual(result.region, 'us-central1');
        assert.strictEqual(result.isFallback, true);
    });

    await t.test('should fallback for undefined region', () => {
        const result = getRegionalEgressIps(undefined);
        assert.strictEqual(result.region, 'us-central1');
        assert.strictEqual(result.isFallback, true);
    });
});
