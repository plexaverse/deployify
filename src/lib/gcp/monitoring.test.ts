import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getScalingRecommendations, ResourceMetrics } from './monitoring';

describe('Scaling Recommendations Logic', () => {
    const mockMetrics: ResourceMetrics = {
        cpuUtilization: 10,
        memoryUtilization: 30,
        diskUtilization: 20,
        timestamp: new Date().toISOString()
    };

    it('should suggest upgrade when CPU is high', async () => {
        const highCpuMetrics = { ...mockMetrics, cpuUtilization: 80 };
        const recommendations = await getScalingRecommendations('cloud-sql-postgres', highCpuMetrics, { tier: 'db-f1-micro' });

        assert.strictEqual(recommendations.length, 1);
        assert.strictEqual(recommendations[0].type, 'upgrade');
        assert.strictEqual(recommendations[0].resource, 'cpu');
        assert.strictEqual(recommendations[0].recommendedTier, 'db-g1-small');
    });

    it('should suggest downgrade when CPU is consistently low', async () => {
        const lowCpuMetrics = { ...mockMetrics, cpuUtilization: 5 };
        const recommendations = await getScalingRecommendations('cloud-sql-postgres', lowCpuMetrics, { tier: 'db-custom-1-3840' });

        assert.strictEqual(recommendations.length, 1);
        assert.strictEqual(recommendations[0].type, 'downgrade');
        assert.strictEqual(recommendations[0].recommendedTier, 'db-g1-small');
    });

    it('should suggest upgrade when memory is near capacity', async () => {
        const highMemoryMetrics = { ...mockMetrics, memoryUtilization: 90 };
        const recommendations = await getScalingRecommendations('cloud-sql-postgres', highMemoryMetrics, { tier: 'db-f1-micro' });

        assert.ok(recommendations.some(r => r.type === 'upgrade' && r.resource === 'memory'));
    });

    it('should suggest disk upgrade for Cloud SQL when disk is low', async () => {
        const highDiskMetrics = { ...mockMetrics, diskUtilization: 85 };
        const recommendations = await getScalingRecommendations('cloud-sql-postgres', highDiskMetrics, { diskSizeGb: 10 });

        assert.ok(recommendations.some(r => r.type === 'upgrade' && r.resource === 'disk' && r.recommendedTier === '30GB'));
    });

    it('should return no recommendations for healthy utilization', async () => {
        const healthyMetrics = {
            cpuUtilization: 40,
            memoryUtilization: 50,
            diskUtilization: 30,
            timestamp: new Date().toISOString()
        };
        const recommendations = await getScalingRecommendations('cloud-sql-postgres', healthyMetrics, { tier: 'db-g1-small' });

        assert.strictEqual(recommendations.length, 0);
    });

    it('should suggest Neon upgrade when compute is high', async () => {
        const highCpuMetrics = { ...mockMetrics, cpuUtilization: 80 };
        const recommendations = await getScalingRecommendations('neon', highCpuMetrics, { tier: 'FREE' });

        assert.ok(recommendations.some(r => r.type === 'upgrade' && r.recommendedTier === 'LAUNCH'));
    });

    it('should suggest Neon downgrade when compute is low', async () => {
        const lowCpuMetrics = { ...mockMetrics, cpuUtilization: 5 };
        const recommendations = await getScalingRecommendations('neon', lowCpuMetrics, { tier: 'SCALE' });

        assert.ok(recommendations.some(r => r.type === 'downgrade' && r.recommendedTier === 'PRO'));
    });
});
