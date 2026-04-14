import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateEWMA, isDegraded } from './health-utils';

describe('Predictive Health Utils', () => {
    describe('calculateEWMA', () => {
        test('should return current latency if no previous baseline', () => {
            assert.strictEqual(calculateEWMA(100), 100);
        });

        test('should calculate EWMA correctly with alpha=0.2', () => {
            // newBaseline = (0.2 * 200) + (0.8 * 100) = 40 + 80 = 120
            assert.strictEqual(calculateEWMA(200, 100), 120);
        });

        test('should handle zero or negative baseline', () => {
            assert.strictEqual(calculateEWMA(150, 0), 150);
            assert.strictEqual(calculateEWMA(150, -10), 150);
        });
    });

    describe('isDegraded', () => {
        test('should return false if no baseline', () => {
            assert.strictEqual(isDegraded(100, undefined), false);
        });

        test('should return true if latency exceeds 2x baseline and 100ms delta', () => {
            // baseline 100, latency 300. 300 > 2*100 (200) AND 300-100 (200) > 100
            assert.strictEqual(isDegraded(300, 100), true);
        });

        test('should return false if latency exceeds 2x baseline but not 100ms delta', () => {
            // baseline 10, latency 25. 25 > 2*10 (20) BUT 25-10 (15) < 100
            assert.strictEqual(isDegraded(25, 10), false);
        });

        test('should return false if latency is high but below 2x baseline', () => {
            // baseline 500, latency 900. 900 < 2*500 (1000)
            assert.strictEqual(isDegraded(900, 500), false);
        });
    });
});
