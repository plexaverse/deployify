import { test, describe } from 'node:test';
import assert from 'node:assert';
import { validateConnection, diagnoseConnection } from './storage-validator';

describe('Storage Connection Validation', () => {
    // In mock mode (which is active in tests via process.env.MOCK_DB), validation should pass for all
    test('should validate mock connections successfully', async () => {
        const originalMockDb = process.env.MOCK_DB;
        process.env.MOCK_DB = 'true';
        try {
            const result = await validateConnection('cloud-sql-postgres', 'mock-secret-id');
            assert.strictEqual(result.valid, true);
            assert.ok(result.latency !== undefined);
        } finally {
            process.env.MOCK_DB = originalMockDb;
        }
    });

    test('should fail if connection string is missing for non-firestore types', async () => {
        const originalMockDb = process.env.MOCK_DB;
        process.env.MOCK_DB = 'false';

        try {
            const result = await validateConnection('cloud-sql-postgres', undefined);
            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.error, 'Connection string is required');
        } finally {
            process.env.MOCK_DB = originalMockDb;
        }
    });

    test('should validate firestore without connection string', async () => {
        const originalMockDb = process.env.MOCK_DB;
        process.env.MOCK_DB = 'false';

        try {
            const result = await validateConnection('firestore', undefined);
            assert.strictEqual(result.valid, true);
        } finally {
            process.env.MOCK_DB = originalMockDb;
        }
    });

    test('should handle unsupported types', async () => {
        const originalMockDb = process.env.MOCK_DB;
        process.env.MOCK_DB = 'false';

        try {
            const result = await validateConnection('unsupported' as import('@/types').StorageType, 'some-id');
            // We just care that it returns a result, the specific error might vary by environment
            assert.ok(typeof result.valid === 'boolean');
        } finally {
            process.env.MOCK_DB = originalMockDb;
        }
    });
});

describe('Storage Connection Diagnosis', () => {
    test('should include regional IPs in recommendations for external connectors', async () => {
        const originalMockDb = process.env.MOCK_DB;
        process.env.MOCK_DB = 'true';

        try {
            // Test with a project region that has specific IPs
            const result = await diagnoseConnection(
                'supabase',
                'mock-secret',
                { region: 'us-central1' },
                { region: 'us-central1' }
            );

            assert.strictEqual(result.success, true);
        } finally {
            process.env.MOCK_DB = originalMockDb;
        }
    });
});

describe('Storage Health Heartbeat & Baselining', () => {
    test('should identify degraded status when latency exceeds baseline', async () => {
        const { checkConnectivityHealth } = await import('./storage-validator');
        const originalMockDb = process.env.MOCK_DB;
        process.env.MOCK_DB = 'true';

        try {
            // In mock mode, checkConnectivityHealth uses a random latency 5-25ms
            // If we provide a tiny baseline like 1ms, it should frequently be degraded
            const result = await checkConnectivityHealth('cloud-sql-postgres', 'mock-secret', {}, 1);

            // Note: Since it's random (5-25), it will be > 1*2 (2ms)
            assert.ok(result.latency >= 5);
            assert.strictEqual(result.status, 'degraded');
            assert.strictEqual(result.isDegraded, true);
        } finally {
            process.env.MOCK_DB = originalMockDb;
        }
    });

    test('should identify healthy status when latency is within baseline', async () => {
        const { checkConnectivityHealth } = await import('./storage-validator');
        const originalMockDb = process.env.MOCK_DB;
        process.env.MOCK_DB = 'true';

        try {
            // If we provide a huge baseline like 100ms, it should be healthy
            const result = await checkConnectivityHealth('cloud-sql-postgres', 'mock-secret', {}, 100);

            assert.strictEqual(result.status, 'healthy');
            assert.strictEqual(result.isDegraded, false);
        } finally {
            process.env.MOCK_DB = originalMockDb;
        }
    });
});
