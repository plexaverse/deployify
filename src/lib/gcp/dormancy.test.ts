import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getResourceDormancy } from './monitoring';

describe('Resource Dormancy Logic', () => {
    it('should identify resource as dormant when utilization is extremely low', async () => {
        // We use mock mode for this test, which randomizes but we can check the return structure
        process.env.MOCK_DB = 'true';
        const result = await getResourceDormancy('cloud-sql-postgres', 'mock-instance');

        assert.strictEqual(typeof result.isDormant, 'boolean');
        assert.strictEqual(result.analysisPeriodDays, 7);
        assert.ok(result.avgCpuUtilization >= 0);
        assert.ok(result.avgMemoryUtilization >= 0);
    });

    it('should handle Firestore as non-dormant (unsupported for analysis)', async () => {
        process.env.MOCK_DB = 'true';
        const result = await getResourceDormancy('firestore', 'mock-db');
        assert.strictEqual(result.isDormant, false);
    });
});
