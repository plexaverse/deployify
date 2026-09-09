import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getServiceClaimMode, OWNERSHIP_LABEL } from './service-claim';

const env = process.env as Record<string, string | undefined>;

describe('getServiceClaimMode', () => {
    test('defaults to enforce', () => {
        delete env.CLOUD_RUN_SERVICE_CLAIM_MODE;
        assert.strictEqual(getServiceClaimMode(), 'enforce');
    });

    test('honours monitor and off', () => {
        env.CLOUD_RUN_SERVICE_CLAIM_MODE = 'monitor';
        assert.strictEqual(getServiceClaimMode(), 'monitor');
        env.CLOUD_RUN_SERVICE_CLAIM_MODE = 'off';
        assert.strictEqual(getServiceClaimMode(), 'off');
        delete env.CLOUD_RUN_SERVICE_CLAIM_MODE;
    });

    test('falls back to enforce on an unknown value', () => {
        env.CLOUD_RUN_SERVICE_CLAIM_MODE = 'nonsense';
        assert.strictEqual(getServiceClaimMode(), 'enforce');
        delete env.CLOUD_RUN_SERVICE_CLAIM_MODE;
    });

    test('uses the same label key discovery reads', () => {
        assert.strictEqual(OWNERSHIP_LABEL, 'deployify-project-id');
    });
});
