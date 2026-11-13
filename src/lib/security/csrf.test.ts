import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { config } from '@/lib/config';
import { checkRequestProvenance, getCsrfMode, isExemptPath, type RequestProvenance } from './csrf';

const ENV_KEYS = ['CSRF_ORIGIN_MODE', 'CSRF_PROTECT_SAFE_METHODS', 'CSRF_ALLOWED_ORIGINS', 'MOCK_DB', 'NEXT_PUBLIC_APP_URL'] as const;
const saved: Record<string, string | undefined> = {};

function req(overrides: Partial<RequestProvenance> = {}): RequestProvenance {
    return {
        method: 'POST',
        pathname: '/api/projects/p1/env',
        origin: null,
        secFetchSite: null,
        secFetchMode: null,
        ...overrides,
    };
}

describe('CSRF request-provenance guard', () => {
    beforeEach(() => {
        for (const k of ENV_KEYS) saved[k] = process.env[k];
        for (const k of ENV_KEYS) delete process.env[k];
    });

    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    });

    test('blocks the sibling-subdomain attack (same-site is NOT trusted)', () => {
        const v = checkRequestProvenance(req({
            origin: 'https://attacker.deployify.io',
            secFetchSite: 'same-site',
            secFetchMode: 'cors',
        }));
        assert.strictEqual(v.allowed, false);
    });

    test('blocks a classic cross-site forged POST', () => {
        const v = checkRequestProvenance(req({
            origin: 'https://evil.example.com',
            secFetchSite: 'cross-site',
            secFetchMode: 'cors',
        }));
        assert.strictEqual(v.allowed, false);
    });

    test('blocks a sandboxed-iframe / redirected form post (Origin: null)', () => {
        assert.strictEqual(checkRequestProvenance(req({ origin: 'null', secFetchSite: 'cross-site' })).allowed, false);
        // legacy browser: no Sec-Fetch-Site at all
        assert.strictEqual(checkRequestProvenance(req({ origin: 'null' })).allowed, false);
    });

    test('allows the real dashboard (same-origin fetch)', () => {
        const v = checkRequestProvenance(req({
            origin: 'https://deployify.io',
            secFetchSite: 'same-origin',
            secFetchMode: 'cors',
        }));
        assert.strictEqual(v.allowed, true);
    });

    test('allows same-origin even when the configured app URL does not match', () => {
        // config.appUrl is captured at module load, so a misconfigured
        // NEXT_PUBLIC_APP_URL cannot be fixed at runtime. Same-origin must
        // therefore be approved on Sec-Fetch-Site alone, before any allow-list
        // lookup, or a config typo would lock every real user out.
        const v = checkRequestProvenance(req({
            origin: 'https://deployify.io',
            secFetchSite: 'same-origin',
        }));
        assert.strictEqual(v.allowed, true, 'a bad app URL must never lock out real users');
    });

    test('allows the shipped CLI: cookie only, no Origin, no Sec-Fetch-Site', () => {
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
            assert.strictEqual(checkRequestProvenance(req({ method })).allowed, true, method);
        }
    });

    test('allows webhooks, cron, the tenant proxy and the analytics collector', () => {
        const hostile = { origin: 'https://evil.example.com', secFetchSite: 'cross-site' };
        for (const pathname of [
            '/api/webhooks/github',
            '/api/billing/webhook',
            '/api/cron/optimize',
            '/api/v1/proxy/myapp/checkout',
            '/api/v1/collect',
            '/api/auth/github',
            '/api/auth/callback',
        ]) {
            assert.strictEqual(checkRequestProvenance(req({ pathname, ...hostile })).allowed, true, pathname);
            assert.strictEqual(isExemptPath(pathname), true, pathname);
        }
    });

    test('exempt matching is prefix-safe (no /api/cronjacked bypass)', () => {
        assert.strictEqual(isExemptPath('/api/cronjacked'), false);
        assert.strictEqual(isExemptPath('/api/v1/collectors/steal'), false);
        assert.strictEqual(isExemptPath('/api/cron'), true);
        assert.strictEqual(isExemptPath('/api/cron/optimize'), true);
    });

    test('safe methods pass by default and are checked under the stage-3 flag', () => {
        const hostileGet = req({ method: 'GET', pathname: '/api/projects/p1/env/e1/reveal', origin: 'https://attacker.deployify.io', secFetchSite: 'same-site', secFetchMode: 'cors' });
        assert.strictEqual(checkRequestProvenance(hostileGet).allowed, true, 'default: GET unchecked');

        process.env.CSRF_PROTECT_SAFE_METHODS = 'true';
        assert.strictEqual(checkRequestProvenance(hostileGet).allowed, false, 'flag on: GET checked');

        // ...but a top-level link-in must still work with the flag on.
        assert.strictEqual(
            checkRequestProvenance(req({ method: 'GET', pathname: '/api/billing/invoices/i1/download', secFetchSite: 'cross-site', secFetchMode: 'navigate' })).allowed,
            true
        );
    });

    test('www and apex are treated as siblings, and CSRF_ALLOWED_ORIGINS extends the set', () => {
        // config.appUrl defaults to http://localhost:3000 under test.
        const appOrigin = new URL(config.appUrl).origin;
        const wwwOrigin = new URL(config.appUrl);
        wwwOrigin.hostname = `www.${wwwOrigin.hostname}`;
        assert.strictEqual(checkRequestProvenance(req({ origin: appOrigin })).allowed, true);
        assert.strictEqual(checkRequestProvenance(req({ origin: wwwOrigin.origin })).allowed, true);

        process.env.CSRF_ALLOWED_ORIGINS = 'https://staging.deployify.dev';
        assert.strictEqual(checkRequestProvenance(req({ origin: 'https://staging.deployify.dev', secFetchSite: 'cross-site' })).allowed, true);
        assert.strictEqual(checkRequestProvenance(req({ origin: 'https://other.deployify.dev', secFetchSite: 'cross-site' })).allowed, false);
    });

    test('local dev origins are allowed under MOCK_DB / development', () => {
        process.env.MOCK_DB = 'true';
        assert.strictEqual(checkRequestProvenance(req({ origin: 'http://localhost:3000', secFetchSite: 'cross-site' })).allowed, true);
    });

    test('mode defaults to report and honours the env override', () => {
        assert.strictEqual(getCsrfMode(), 'report');
        process.env.CSRF_ORIGIN_MODE = 'enforce';
        assert.strictEqual(getCsrfMode(), 'enforce');
        process.env.CSRF_ORIGIN_MODE = 'OFF';
        assert.strictEqual(getCsrfMode(), 'off');
        process.env.CSRF_ORIGIN_MODE = 'garbage';
        assert.strictEqual(getCsrfMode(), 'report');
    });
});
