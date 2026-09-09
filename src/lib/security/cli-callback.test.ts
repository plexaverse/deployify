import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeCliCallbackPort, buildCliCallbackUrl, getCliCallbackHost } from './cli-callback';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1XzEyMyJ9.abc-_XYZ09';

test('normalizeCliCallbackPort', async (t) => {
    await t.test('accepts a real ephemeral port', () => {
        assert.strictEqual(normalizeCliCallbackPort('54321'), '54321');
        assert.strictEqual(normalizeCliCallbackPort(54321), '54321');
    });

    await t.test('accepts the boundaries', () => {
        assert.strictEqual(normalizeCliCallbackPort('1'), '1');
        assert.strictEqual(normalizeCliCallbackPort('65535'), '65535');
    });

    await t.test('rejects userinfo injection payloads', () => {
        assert.strictEqual(normalizeCliCallbackPort('1@evil.com'), null);
        assert.strictEqual(normalizeCliCallbackPort('1@evil.com:80'), null);
        assert.strictEqual(normalizeCliCallbackPort('80@evil.com/#'), null);
        assert.strictEqual(normalizeCliCallbackPort('1%40evil.com'), null);
    });

    await t.test('rejects out-of-range and non-numeric values', () => {
        assert.strictEqual(normalizeCliCallbackPort('0'), null);
        assert.strictEqual(normalizeCliCallbackPort('65536'), null);
        assert.strictEqual(normalizeCliCallbackPort('999999'), null);
        assert.strictEqual(normalizeCliCallbackPort('1e3'), null);
        assert.strictEqual(normalizeCliCallbackPort('+80'), null);
        assert.strictEqual(normalizeCliCallbackPort('-1'), null);
        assert.strictEqual(normalizeCliCallbackPort('abc'), null);
        assert.strictEqual(normalizeCliCallbackPort(''), null);
        assert.strictEqual(normalizeCliCallbackPort(null), null);
        assert.strictEqual(normalizeCliCallbackPort(undefined), null);
        assert.strictEqual(normalizeCliCallbackPort({ port: 80 }), null);
    });
});

test('buildCliCallbackUrl', async (t) => {
    await t.test('is byte-identical to the legacy template for a valid port', () => {
        assert.strictEqual(
            buildCliCallbackUrl('54321', TOKEN),
            `http://localhost:54321/callback?token=${TOKEN}`
        );
    });

    await t.test('never emits a non-loopback host', () => {
        for (const payload of ['1@evil.com', 'evil.com', '1@evil.com:80', '../evil.com']) {
            assert.strictEqual(buildCliCallbackUrl(payload, TOKEN), null);
        }
    });

    await t.test('would keep the host loopback even if the port slipped through', () => {
        const url = new URL(buildCliCallbackUrl('8080', TOKEN)!);
        assert.strictEqual(url.hostname, 'localhost');
        assert.strictEqual(url.username, '');
        assert.strictEqual(url.searchParams.get('token'), TOKEN);
    });
});

test('getCliCallbackHost defaults to localhost and rejects arbitrary overrides', () => {
    const previous = process.env.DEPLOYIFY_CLI_CALLBACK_HOST;
    try {
        delete process.env.DEPLOYIFY_CLI_CALLBACK_HOST;
        assert.strictEqual(getCliCallbackHost(), 'localhost');

        process.env.DEPLOYIFY_CLI_CALLBACK_HOST = '127.0.0.1';
        assert.strictEqual(getCliCallbackHost(), '127.0.0.1');

        process.env.DEPLOYIFY_CLI_CALLBACK_HOST = 'evil.com';
        assert.strictEqual(getCliCallbackHost(), 'localhost');
    } finally {
        if (previous === undefined) {
            delete process.env.DEPLOYIFY_CLI_CALLBACK_HOST;
        } else {
            process.env.DEPLOYIFY_CLI_CALLBACK_HOST = previous;
        }
    }
});
