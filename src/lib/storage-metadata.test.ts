import { test, describe } from 'node:test';
import assert from 'node:assert';
import { sanitizeClientMetadata, SERVER_OWNED_METADATA_KEYS } from './storage-metadata';

const env = process.env as Record<string, string | undefined>;

describe('sanitizeClientMetadata', () => {
    test('strips server-owned keys by default', () => {
        delete env.STORAGE_METADATA_STRICT;
        const out = sanitizeClientMetadata(
            { tier: 'db-f1-micro', resourceName: 'victim-prod-db', provisioned: true },
            'test'
        );
        assert.strictEqual(out.resourceName, undefined);
        assert.strictEqual(out.provisioned, undefined);
        assert.strictEqual(out.tier, 'db-f1-micro', 'tenant-owned keys must survive');
    });

    test('leaves metadata untouched when it has no server-owned keys', () => {
        const input = { tier: 'db-g1-small', highAvailability: true };
        assert.deepStrictEqual(sanitizeClientMetadata(input, 'test'), input);
    });

    test('STORAGE_METADATA_STRICT=false restores warn-only behaviour', () => {
        env.STORAGE_METADATA_STRICT = 'false';
        const out = sanitizeClientMetadata({ resourceName: 'victim-prod-db' }, 'test');
        delete env.STORAGE_METADATA_STRICT;
        assert.strictEqual(out.resourceName, 'victim-prod-db');
    });

    test('covers the keys privileged code paths read', () => {
        for (const key of ['provisioned', 'resourceName', 'excessiveRoles', 'replicas']) {
            assert.ok(
                (SERVER_OWNED_METADATA_KEYS as readonly string[]).includes(key),
                `${key} must be server-owned`
            );
        }
    });

    test('passes through null and non-objects unchanged', () => {
        assert.strictEqual(sanitizeClientMetadata(null, 'test'), null);
        assert.strictEqual(sanitizeClientMetadata(undefined, 'test'), undefined);
    });
});
