import { describe, it } from 'node:test';
import assert from 'node:assert';
import { optimizeConnectionPools, type ResourceMetrics } from './monitoring';
import type { StorageConfig } from '@/types';
import type { DatabaseSession } from './cloudsql';

describe('Connection Pool Optimization Logic', () => {
    const mockStorage: StorageConfig = {
        id: 'test-storage',
        type: 'cloud-sql-postgres',
        name: 'Test DB',
        status: 'active',
        environment: 'production',
        metadata: {
            tier: 'db-f1-micro'
        },
        createdAt: new Date(),
        updatedAt: new Date()
    } as unknown as StorageConfig;

    const mockMetrics: ResourceMetrics = {
        cpuUtilization: 20,
        memoryUtilization: 30,
        connectionSaturation: 10,
        timestamp: new Date().toISOString()
    };

    const mockSessions: DatabaseSession[] = [
        { id: '1', state: 'active', clientAddress: '1.2.3.4', startTime: new Date().toISOString(), query: 'SELECT 1' },
        { id: '2', state: 'idle', clientAddress: '1.2.3.4', startTime: new Date().toISOString(), query: '' },
    ];

    it('should suggest optimization when saturation is high', () => {
        const highSaturationMetrics = { ...mockMetrics, connectionSaturation: 85 };
        const manyActiveSessions: DatabaseSession[] = Array(15).fill(null).map((_, i) => ({
            id: `s-${i}`,
            state: 'active',
            clientAddress: '1.2.3.4',
            startTime: new Date().toISOString(),
            query: 'SELECT 1'
        }));

        const result = optimizeConnectionPools(mockStorage, highSaturationMetrics, manyActiveSessions);

        assert.ok(result);
        assert.strictEqual(result.impact, 'high');
        assert.ok(result.recommendedMax > 10);
        assert.ok(result.implementationSnippets.prisma);
        assert.ok(result.implementationSnippets.nodePg);
    });

    it('should adjust recommendations based on workload (READ_HEAVY)', () => {
        const readHeavyStorage = {
            ...mockStorage,
            workloadProfile: { type: 'READ_HEAVY', confidence: 0.9, lastAnalyzedAt: new Date().toISOString() }
        } as unknown as StorageConfig;

        const result = optimizeConnectionPools(readHeavyStorage, { ...mockMetrics, connectionSaturation: 60 }, mockSessions);

        assert.ok(result);
        assert.ok(result.recommendedMin >= 5);
    });

    it('should return undefined when pool is already healthy', () => {
        const healthyMetrics = { ...mockMetrics, connectionSaturation: 5 };
        const result = optimizeConnectionPools(mockStorage, healthyMetrics, mockSessions);

        assert.strictEqual(result, undefined);
    });

    it('should support MySQL specific snippets', () => {
        const mysqlStorage = {
            ...mockStorage,
            type: 'cloud-sql-mysql'
        } as unknown as StorageConfig;

        const result = optimizeConnectionPools(mysqlStorage, { ...mockMetrics, connectionSaturation: 70 }, mockSessions);

        assert.ok(result);
        assert.ok(result.implementationSnippets.nodeMysql2);
        assert.ok(!result.implementationSnippets.nodePg);
        assert.ok(result.implementationSnippets.prisma?.includes('provider = "mysql"'));
    });
});
