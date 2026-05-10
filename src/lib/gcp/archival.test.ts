import { test } from 'node:test';
import assert from 'node:assert';
import { calculateArchivalSavings, discoverArchivalCandidates } from './monitoring';
import { StorageConfig } from '@/types';

test('calculateArchivalSavings', () => {
    // 100GB * (0.17 - 0.004) = 16.6
    assert.strictEqual(calculateArchivalSavings(100), 16.6);
    assert.strictEqual(calculateArchivalSavings(10), 1.66);
});

test('discoverArchivalCandidates in mock mode', async () => {
    process.env.MOCK_DB = 'true';
    const storage: StorageConfig = {
        id: 's1',
        type: 'cloud-sql-postgres',
        name: 'Prod DB',
        status: 'active',
        environment: 'production',
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const report = await discoverArchivalCandidates(storage, 'postgresql://mock');

    // In mock mode, results are randomized but structured
    assert.ok(typeof report.hasCandidates === 'boolean');
    if (report.hasCandidates) {
        assert.ok(report.candidates.length > 0);
        assert.ok(report.totalPotentialSavingsMonthly > 0);
        assert.ok(report.candidates[0].entity);
        assert.ok(report.candidates[0].sizeGb > 0);
    }
});
