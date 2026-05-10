import { test } from 'node:test';
import assert from 'node:assert';
import { discoverIndexBloat, calculateBloatImpact } from './monitoring';
import type { StorageConfig } from '@/types';

test('discoverIndexBloat mock mode', async () => {
    process.env.MOCK_DB = 'true';
    const mockStorage = { id: 'test-db', type: 'cloud-sql-postgres', name: 'Test DB' } as StorageConfig;
    const report = await discoverIndexBloat(mockStorage, '');

    assert.strictEqual(typeof report.hasBloat, 'boolean');
    if (report.hasBloat) {
        assert.ok(report.candidates.length > 0);
        assert.ok(report.totalWastedMb > 0);
        assert.ok(report.candidates[0].bloatPercentage > 0);
    }
});

test('calculateBloatImpact', () => {
    // Low bloat
    assert.ok(calculateBloatImpact(10, 5) < 30);

    // High bloat
    const highImpact = calculateBloatImpact(600, 80);
    assert.ok(highImpact > 70);

    // Caps at 100
    assert.strictEqual(calculateBloatImpact(10000, 100), 100);
});
