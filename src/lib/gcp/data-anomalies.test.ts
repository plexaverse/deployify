import { test } from 'node:test';
import * as assert from 'node:assert';
import { discoverDataAnomalies } from './monitoring';

test('discoverDataAnomalies', async (t) => {
    // Save original env
    const originalEnv = process.env.MOCK_DB;

    await t.test('should return anomalies when MOCK_DB is true (stochastic)', async () => {
        process.env.MOCK_DB = 'true';

        let foundAnomalies = false;
        let noAnomalies = false;

        // Since it's Math.random() > 0.5, we run it a few times to guarantee we see both true and false paths (with high probability).
        for (let i = 0; i < 20; i++) {
            const report = await discoverDataAnomalies('project-id', 'storage-id');
            if (report.hasAnomalies && report.anomalies.length > 0) {
                foundAnomalies = true;
                assert.ok(report.anomalies[0].id.startsWith('anomaly-null-'));
                assert.strictEqual(report.anomalies[0].type, 'NULL_CONCENTRATION');
            } else if (!report.hasAnomalies && report.anomalies.length === 0) {
                noAnomalies = true;
            }
        }

        assert.ok(foundAnomalies, 'Should have generated anomalies at least once');
        assert.ok(noAnomalies, 'Should have generated empty reports at least once');
    });

    await t.test('should return empty report when MOCK_DB is false', async () => {
        process.env.MOCK_DB = 'false';

        const report = await discoverDataAnomalies('project-id', 'storage-id');
        assert.strictEqual(report.hasAnomalies, false);
        assert.strictEqual(report.anomalies.length, 0);
    });

    // Restore env
    process.env.MOCK_DB = originalEnv;
});
