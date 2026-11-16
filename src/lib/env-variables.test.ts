import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import type { Project } from '@/types';
import {
    ENV_KEY_ERROR,
    MAX_ENV_DESCRIPTION_LENGTH,
    isDuplicateEnvKey,
    normalizeEnvDescription,
    resolveEnvValueUpdate,
    validateEnvKey,
} from './env-variables';

describe('validateEnvKey', () => {
    test('accepts the shapes the deployment pipeline can export', () => {
        for (const key of ['A', 'DATABASE_URL', 'API_KEY_2', 'X_1_Y']) {
            assert.deepStrictEqual(validateEnvKey(key), { valid: true }, key);
        }
    });

    test('rejects keys a shell env cannot carry', () => {
        // Lowercase, leading digit/underscore, spaces, dashes and dots all round-trip
        // into Cloud Build / Cloud Run as something other than what was typed.
        for (const key of ['database_url', '1KEY', '_KEY', 'MY KEY', 'MY-KEY', 'MY.KEY', 'KEY=1']) {
            const result = validateEnvKey(key);
            assert.strictEqual(result.valid, false, key);
            if (!result.valid) assert.strictEqual(result.error, ENV_KEY_ERROR);
        }
    });

    test('rejects a missing or non-string key', () => {
        for (const key of ['', undefined, null, 42, {}]) {
            assert.strictEqual(validateEnvKey(key).valid, false, String(key));
        }
    });
});

describe('isDuplicateEnvKey', () => {
    const existing = [
        { id: 'env_1', key: 'DATABASE_URL' },
        { id: 'env_2', key: 'API_KEY' },
    ];

    test('reports a clash with another variable', () => {
        assert.strictEqual(isDuplicateEnvKey(existing, 'API_KEY'), true);
    });

    test('allows a free key', () => {
        assert.strictEqual(isDuplicateEnvKey(existing, 'REDIS_URL'), false);
    });

    test('does not report a variable as a clash with itself', () => {
        // Saving a description change without renaming must not be rejected.
        assert.strictEqual(isDuplicateEnvKey(existing, 'API_KEY', 'env_2'), false);
    });

    test('still catches a rename onto a sibling key', () => {
        assert.strictEqual(isDuplicateEnvKey(existing, 'DATABASE_URL', 'env_2'), true);
    });

    test('is case sensitive, matching the key format', () => {
        assert.strictEqual(isDuplicateEnvKey(existing, 'api_key'), false);
    });
});

describe('normalizeEnvDescription', () => {
    test('absent description yields undefined, not an empty string', () => {
        assert.deepStrictEqual(normalizeEnvDescription(undefined), { valid: true, value: undefined });
        assert.deepStrictEqual(normalizeEnvDescription(null), { valid: true, value: undefined });
    });

    test('blank and whitespace-only descriptions clear the note', () => {
        assert.deepStrictEqual(normalizeEnvDescription(''), { valid: true, value: undefined });
        assert.deepStrictEqual(normalizeEnvDescription('   \n\t '), { valid: true, value: undefined });
    });

    test('trims surrounding whitespace', () => {
        assert.deepStrictEqual(
            normalizeEnvDescription('  Stripe webhook signing secret  '),
            { valid: true, value: 'Stripe webhook signing secret' }
        );
    });

    test('accepts a description exactly at the limit', () => {
        const atLimit = 'x'.repeat(MAX_ENV_DESCRIPTION_LENGTH);
        assert.deepStrictEqual(normalizeEnvDescription(atLimit), { valid: true, value: atLimit });
    });

    test('rejects one character over the limit', () => {
        const overLimit = 'x'.repeat(MAX_ENV_DESCRIPTION_LENGTH + 1);
        const result = normalizeEnvDescription(overLimit);
        assert.strictEqual(result.valid, false);
    });

    test('measures the trimmed length, not the raw length', () => {
        const padded = `   ${'x'.repeat(MAX_ENV_DESCRIPTION_LENGTH)}   `;
        assert.strictEqual(normalizeEnvDescription(padded).valid, true);
    });

    test('rejects a non-string description', () => {
        assert.strictEqual(normalizeEnvDescription(42).valid, false);
        assert.strictEqual(normalizeEnvDescription({ text: 'hi' }).valid, false);
    });
});

describe('resolveEnvValueUpdate', () => {
    // Stand-ins for the real AES helpers: same `enc:` prefix contract, reversible.
    const codec = {
        encrypt: (plaintext: string) => `enc:${plaintext}`,
        decrypt: (ciphertext: string) => ciphertext.replace(/^enc:/, ''),
    };

    test('a new plaintext value is encrypted when the variable is secret', () => {
        const result = resolveEnvValueUpdate(
            { currentValue: 'enc:old', wasEncrypted: true, willEncrypt: true, newValue: 'fresh' },
            codec
        );
        assert.strictEqual(result, 'enc:fresh');
    });

    test('a new plaintext value is stored as-is when the variable is not secret', () => {
        const result = resolveEnvValueUpdate(
            { currentValue: 'old', wasEncrypted: false, willEncrypt: false, newValue: 'fresh' },
            codec
        );
        assert.strictEqual(result, 'fresh');
    });

    test('an untouched secret keeps its stored ciphertext', () => {
        // This is the case the UI relies on: editing only a description must not
        // destroy the secret, because the client never had its plaintext.
        const result = resolveEnvValueUpdate(
            { currentValue: 'enc:kept', wasEncrypted: true, willEncrypt: true },
            codec
        );
        assert.strictEqual(result, 'enc:kept');
    });

    test('an untouched plain value is left alone', () => {
        const result = resolveEnvValueUpdate(
            { currentValue: 'plain', wasEncrypted: false, willEncrypt: false },
            codec
        );
        assert.strictEqual(result, 'plain');
    });

    test('turning secret on encrypts the value already stored', () => {
        const result = resolveEnvValueUpdate(
            { currentValue: 'plain', wasEncrypted: false, willEncrypt: true },
            codec
        );
        assert.strictEqual(result, 'enc:plain');
    });

    test('turning secret off decrypts the value already stored', () => {
        const result = resolveEnvValueUpdate(
            { currentValue: 'enc:plain', wasEncrypted: true, willEncrypt: false },
            codec
        );
        assert.strictEqual(result, 'plain');
    });

    test('turning secret on never double-encrypts an already-encrypted value', () => {
        // Guards against a row whose isEncrypted flag drifted from its stored value;
        // double-encrypting would make the secret permanently unreadable.
        const result = resolveEnvValueUpdate(
            { currentValue: 'enc:already', wasEncrypted: false, willEncrypt: true },
            codec
        );
        assert.strictEqual(result, 'enc:already');
    });

    test('turning secret off leaves an already-plain value alone', () => {
        const result = resolveEnvValueUpdate(
            { currentValue: 'plain', wasEncrypted: true, willEncrypt: false },
            codec
        );
        assert.strictEqual(result, 'plain');
    });

    test('an explicitly empty new value is honoured rather than treated as absent', () => {
        // The route only forwards `value` when the client sent one; '' must mean
        // "set it to empty", not "keep the old one".
        const result = resolveEnvValueUpdate(
            { currentValue: 'old', wasEncrypted: false, willEncrypt: false, newValue: '' },
            codec
        );
        assert.strictEqual(result, '');
    });
});

describe('descriptions are metadata, not configuration', () => {
    before(() => {
        process.env.MOCK_DB = 'true';
    });

    test('a description never reaches the build or runtime environment', async () => {
        // A description is a free-text note a teammate writes. If it leaked into the
        // exported environment it would become a container env var of its own, and
        // notes on secrets would end up in plaintext in the build log.
        const { getEnvVarsForDeployment } = await import('@/lib/db');

        const project = {
            id: 'proj_1',
            envVariables: [
                {
                    id: 'env_1',
                    key: 'STRIPE_PUBLISHABLE_KEY',
                    value: 'pk_test_123',
                    isSecret: false,
                    target: 'both',
                    environment: 'both',
                    description: 'Used by the checkout widget on the pricing page',
                },
            ],
        } as unknown as Project;

        const vars = await getEnvVarsForDeployment(project, 'production');

        assert.strictEqual(vars.buildEnvVars.STRIPE_PUBLISHABLE_KEY, 'pk_test_123');
        assert.strictEqual(vars.runtimeEnvVars.STRIPE_PUBLISHABLE_KEY, 'pk_test_123');

        const exported = [
            ...Object.entries(vars.buildEnvVars),
            ...Object.entries(vars.runtimeEnvVars),
        ];
        assert.strictEqual(
            exported.some(([k, v]) => k.toLowerCase().includes('description') || v.includes('checkout widget')),
            false,
            'the description must not appear as an exported key or value'
        );
    });
});
