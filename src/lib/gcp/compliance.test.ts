import { test, describe } from 'node:test';
import assert from 'node:assert';
import { discoverSensitiveData } from './monitoring';
import { StorageConfig } from '@/types';

describe('PII Discovery Engine', () => {
    test('should return mock compliance report in MOCK_DB mode', async () => {
        process.env.MOCK_DB = 'true';

        const mockStorage = {
            id: 'test-storage',
            type: 'cloud-sql-postgres',
            status: 'active',
            metadata: {}
        } as StorageConfig;

        const report = await discoverSensitiveData(mockStorage, 'postgres://user:pass@host:5432/db');

        assert.strictEqual(typeof report.hasRisk, 'boolean');
        assert.ok(Array.isArray(report.risks));
        assert.ok(report.lastScannedAt);

        if (report.hasRisk) {
            assert.ok(report.risks.length > 0);
            assert.ok(['EMAIL', 'PHONE', 'CREDIT_CARD', 'SSN'].includes(report.risks[0].type));
        }
    });

    test('should handle firestore type in mock mode', async () => {
        process.env.MOCK_DB = 'true';

        const mockStorage = {
            id: 'test-firestore',
            type: 'firestore',
            status: 'active',
            metadata: {}
        } as StorageConfig;

        const report = await discoverSensitiveData(mockStorage, '');
        assert.ok(report.lastScannedAt);
    });
});
