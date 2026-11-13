import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getCspMode, buildCspValue, cspHeader } from './csp';

const env = process.env as Record<string, string | undefined>;

describe('CSP', () => {
    test('defaults to report-only so a wrong policy cannot break the app', () => {
        delete env.CSP_MODE;
        assert.strictEqual(getCspMode(), 'report');
        assert.strictEqual(cspHeader()?.name, 'Content-Security-Policy-Report-Only');
    });

    test('enforce mode sends the blocking header', () => {
        env.CSP_MODE = 'enforce';
        assert.strictEqual(cspHeader()?.name, 'Content-Security-Policy');
        delete env.CSP_MODE;
    });

    test('off mode sends nothing', () => {
        env.CSP_MODE = 'off';
        assert.strictEqual(cspHeader(), null);
        delete env.CSP_MODE;
    });

    test('policy denies framing and plugins, and pins a base URI', () => {
        const v = buildCspValue();
        assert.match(v, /frame-ancestors 'none'/);
        assert.match(v, /object-src 'none'/);
        assert.match(v, /base-uri 'self'/);
    });

    test('policy allows the origins the app actually uses', () => {
        const v = buildCspValue();
        assert.match(v, /avatars\.githubusercontent\.com/);  // next.config remotePatterns
        assert.match(v, /api\.razorpay\.com/);               // checkout
        assert.match(v, /fonts\.gstatic\.com/);              // next/font
    });
});
