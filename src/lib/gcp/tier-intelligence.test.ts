import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getEstimatedMonthlyCost } from './monitoring';

describe('Cost Estimation Tier Intelligence', () => {
    it('should correctly estimate Supabase costs by tier', () => {
        assert.strictEqual(getEstimatedMonthlyCost('supabase', 'FREE'), 0);
        assert.strictEqual(getEstimatedMonthlyCost('supabase', 'PRO'), 25);
        assert.strictEqual(getEstimatedMonthlyCost('supabase', 'TEAM'), 599);
        assert.strictEqual(getEstimatedMonthlyCost('supabase', 'ENTERPRISE'), 2000);
    });

    it('should correctly estimate MongoDB Atlas costs by tier', () => {
        assert.strictEqual(getEstimatedMonthlyCost('mongodb-atlas', 'M0'), 0);
        assert.strictEqual(getEstimatedMonthlyCost('mongodb-atlas', 'M2'), 9);
        assert.strictEqual(getEstimatedMonthlyCost('mongodb-atlas', 'M5'), 25);
        assert.strictEqual(getEstimatedMonthlyCost('mongodb-atlas', 'M10'), 60);
        assert.strictEqual(getEstimatedMonthlyCost('mongodb-atlas', 'M30'), 150);
        assert.strictEqual(getEstimatedMonthlyCost('mongodb-atlas', 'M50'), 150);
        assert.strictEqual(getEstimatedMonthlyCost('mongodb-atlas', 'M8'), 40);
    });

    it('should correctly estimate PlanetScale costs by tier', () => {
        assert.strictEqual(getEstimatedMonthlyCost('planetscale', 'FREE'), 0);
        assert.strictEqual(getEstimatedMonthlyCost('planetscale', 'HOBBY'), 0);
        assert.strictEqual(getEstimatedMonthlyCost('planetscale', 'SCALER'), 29);
        assert.strictEqual(getEstimatedMonthlyCost('planetscale', 'PRO'), 39);
        assert.strictEqual(getEstimatedMonthlyCost('planetscale', 'TEAM'), 599);
    });

    it('should correctly estimate Neon costs by tier', () => {
        assert.strictEqual(getEstimatedMonthlyCost('neon', 'FREE'), 0);
        assert.strictEqual(getEstimatedMonthlyCost('neon', 'LAUNCH'), 19);
        assert.strictEqual(getEstimatedMonthlyCost('neon', 'SCALE'), 69);
        assert.strictEqual(getEstimatedMonthlyCost('neon', 'PRO'), 49);
    });
});
