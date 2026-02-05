import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getLCPStatus, getFIDStatus, getCLSStatus, getScoreStatus } from '../lib/performance/thresholds';

describe('WebVitals Metrics', () => {
    describe('LCP Status', () => {
        it('should return good for values <= 2500', () => {
            assert.strictEqual(getLCPStatus(2500), 'good');
            assert.strictEqual(getLCPStatus(1000), 'good');
        });

        it('should return average for values > 2500 and <= 4000', () => {
            assert.strictEqual(getLCPStatus(2501), 'average');
            assert.strictEqual(getLCPStatus(4000), 'average');
        });

        it('should return poor for values > 4000', () => {
            assert.strictEqual(getLCPStatus(4001), 'poor');
        });
    });

    describe('FID Status', () => {
        it('should return good for values <= 100', () => {
            assert.strictEqual(getFIDStatus(100), 'good');
            assert.strictEqual(getFIDStatus(50), 'good');
        });

        it('should return average for values > 100 and <= 300', () => {
            assert.strictEqual(getFIDStatus(101), 'average');
            assert.strictEqual(getFIDStatus(300), 'average');
        });

        it('should return poor for values > 300', () => {
            assert.strictEqual(getFIDStatus(301), 'poor');
        });
    });

    describe('CLS Status', () => {
        it('should return good for values <= 0.1', () => {
            assert.strictEqual(getCLSStatus(0.1), 'good');
            assert.strictEqual(getCLSStatus(0.05), 'good');
        });

        it('should return average for values > 0.1 and <= 0.25', () => {
            assert.strictEqual(getCLSStatus(0.11), 'average');
            assert.strictEqual(getCLSStatus(0.25), 'average');
        });

        it('should return poor for values > 0.25', () => {
            assert.strictEqual(getCLSStatus(0.251), 'poor');
        });
    });

    describe('Score Status', () => {
        it('should return good for values >= 0.9', () => {
            assert.strictEqual(getScoreStatus(0.9), 'good');
            assert.strictEqual(getScoreStatus(1.0), 'good');
        });

        it('should return average for values >= 0.5 and < 0.9', () => {
            assert.strictEqual(getScoreStatus(0.5), 'average');
            assert.strictEqual(getScoreStatus(0.89), 'average');
        });

        it('should return poor for values < 0.5', () => {
            assert.strictEqual(getScoreStatus(0.49), 'poor');
            assert.strictEqual(getScoreStatus(0), 'poor');
        });
    });
});
