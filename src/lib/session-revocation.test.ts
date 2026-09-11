import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { isSessionRevoked, isRevocationEnabled, invalidateRevocationCache } from './session-revocation';

const env = process.env as Record<string, string | undefined>;

describe('session revocation', () => {
    beforeEach(() => {
        delete env.SESSION_REVOCATION_ENABLED;
        env.MOCK_DB = 'true';
        invalidateRevocationCache('u1');
    });

    test('enabled by default, disablable by env', () => {
        assert.strictEqual(isRevocationEnabled(), true);
        env.SESSION_REVOCATION_ENABLED = 'false';
        assert.strictEqual(isRevocationEnabled(), false);
        delete env.SESSION_REVOCATION_ENABLED;
    });

    test('never revokes under MOCK_DB, so local dev is unaffected', async () => {
        assert.strictEqual(await isSessionRevoked('u1', 1_000), false);
    });

    test('a token with no iat is not treated as revoked (fail open)', async () => {
        assert.strictEqual(await isSessionRevoked('u1', undefined), false);
    });

    test('no userId is not treated as revoked', async () => {
        assert.strictEqual(await isSessionRevoked('', 1_000), false);
    });

    test('disabled means no check at all', async () => {
        env.SESSION_REVOCATION_ENABLED = 'false';
        assert.strictEqual(await isSessionRevoked('u1', 1), false);
        delete env.SESSION_REVOCATION_ENABLED;
    });
});
