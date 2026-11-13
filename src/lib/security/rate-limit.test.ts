import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
    checkRateLimit,
    classifyRoute,
    evaluateApiRateLimit,
    getRateLimitMode,
    getRateLimitScope,
    getTrustedProxyHops,
    limitFor,
    rateLimitStoreSize,
    resetRateLimitStore,
    resolveClientIp,
} from './rate-limit';

const ENV_KEYS = [
    'RATE_LIMIT_MODE',
    'RATE_LIMIT_SCOPE',
    'TRUSTED_PROXY_HOPS',
    'RATE_LIMIT_MAX_ENTRIES',
    'RATE_LIMIT_DEFAULT_REQUESTS',
    'RATE_LIMIT_STRICT_REQUESTS',
    'RATE_LIMIT_CLASS_REQUESTS',
    'RATE_LIMIT_STRICT_CLASS_REQUESTS',
] as const;
const saved: Record<string, string | undefined> = {};

function hit(pathname: string, xff: string | null, xRealIp: string | null = null) {
    return evaluateApiRateLimit({ pathname, xForwardedFor: xff, xRealIp });
}

describe('rate limiting', () => {
    beforeEach(() => {
        for (const k of ENV_KEYS) saved[k] = process.env[k];
        for (const k of ENV_KEYS) delete process.env[k];
        resetRateLimitStore();
    });

    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
        resetRateLimitStore();
    });

    describe('defaults are today behaviour', () => {
        test('mode defaults to legacy, scope to path, hops to 1', () => {
            assert.strictEqual(getRateLimitMode(), 'legacy');
            assert.strictEqual(getRateLimitScope(), 'path');
            assert.strictEqual(getTrustedProxyHops(), 1);
        });

        test('legacy mode reproduces the pre-fix limits and 429 point exactly', () => {
            // 100 allowed on a normal route, the 101st rejected.
            for (let i = 0; i < 100; i++) {
                const v = hit('/api/projects', '9.9.9.9');
                assert.strictEqual(v.allowed, true, `request ${i + 1} should pass`);
                assert.strictEqual(v.limit, 100);
            }
            const blocked = hit('/api/projects', '9.9.9.9');
            assert.strictEqual(blocked.allowed, false);
            assert.strictEqual(blocked.remaining, 0);
            assert.strictEqual(blocked.limit, 100);
        });

        test('legacy mode keeps the strict 30/min bucket for auth and webhooks', () => {
            for (let i = 0; i < 30; i++) {
                assert.strictEqual(hit('/api/auth/github', '9.9.9.9').allowed, true);
            }
            const v = hit('/api/auth/github', '9.9.9.9');
            assert.strictEqual(v.allowed, false);
            assert.strictEqual(v.limit, 30);
        });

        test('legacy mode keeps the per-path key (a different path is a fresh bucket)', () => {
            for (let i = 0; i < 100; i++) hit('/api/projects', '9.9.9.9');
            assert.strictEqual(hit('/api/projects', '9.9.9.9').allowed, false);
            assert.strictEqual(hit('/api/teams', '9.9.9.9').allowed, true);
        });

        test('legacy mode is still bypassable by design (that is what report/enforce fix)', () => {
            for (let i = 0; i < 200; i++) {
                assert.strictEqual(hit('/api/auth/github', `1.2.3.${i}, 8.8.8.8`).allowed, true);
            }
        });
    });

    describe('client IP resolution', () => {
        test('single-element XFF (the real world) is unchanged from the pre-fix value', () => {
            const r = resolveClientIp('203.0.113.7', null);
            assert.strictEqual(r.ip, '203.0.113.7');
            assert.strictEqual(r.legacyIp, '203.0.113.7');
            assert.strictEqual(r.spoofSuspected, false);
        });

        test('caller-supplied XFF is ignored: the appended element wins', () => {
            const r = resolveClientIp('1.2.3.4, 203.0.113.7', null);
            assert.strictEqual(r.ip, '203.0.113.7');
            assert.strictEqual(r.legacyIp, '1.2.3.4');
            assert.strictEqual(r.spoofSuspected, true);
        });

        test('two trusted hops (dashboard behind a GCLB) is configurable', () => {
            const r = resolveClientIp('1.2.3.4, 203.0.113.7, 35.191.0.1', null, 2);
            assert.strictEqual(r.ip, '203.0.113.7');
        });

        test('a chain shorter than the hop count degrades to element 0, not to one shared key', () => {
            assert.strictEqual(resolveClientIp('203.0.113.7', null, 3).ip, '203.0.113.7');
        });

        test('falls back to x-real-ip then unknown, like the pre-fix code', () => {
            assert.strictEqual(resolveClientIp(null, '198.51.100.4').ip, '198.51.100.4');
            assert.strictEqual(resolveClientIp('', null).ip, 'unknown');
            assert.strictEqual(resolveClientIp('  ,  ', null).ip, 'unknown');
        });

        test('whitespace in the chain is trimmed', () => {
            assert.strictEqual(resolveClientIp('1.2.3.4 ,  203.0.113.7 ', null).ip, '203.0.113.7');
        });
    });

    describe('enforce mode closes the bypass', () => {
        beforeEach(() => {
            process.env.RATE_LIMIT_MODE = 'enforce';
        });

        test('rotating the caller-supplied XFF no longer buys a fresh bucket', () => {
            let blockedAt = -1;
            for (let i = 0; i < 60; i++) {
                const v = hit('/api/auth/github', `10.0.0.${i}, 203.0.113.9`);
                if (!v.allowed) { blockedAt = i; break; }
            }
            assert.strictEqual(blockedAt, 30, 'should block on the 31st request from the real IP');
        });

        test('distinct real callers still get their own buckets', () => {
            for (let i = 0; i < 30; i++) hit('/api/auth/github', '203.0.113.9');
            assert.strictEqual(hit('/api/auth/github', '203.0.113.9').allowed, false);
            assert.strictEqual(hit('/api/auth/github', '203.0.113.10').allowed, true);
        });

        test('path scope (default) keeps per-path granularity', () => {
            for (let i = 0; i < 100; i++) hit('/api/projects', '203.0.113.9');
            assert.strictEqual(hit('/api/projects', '203.0.113.9').allowed, false);
            assert.strictEqual(hit('/api/teams', '203.0.113.9').allowed, true);
        });

        test('class scope collapses all of /api/ into one bucket at its own higher limit', () => {
            process.env.RATE_LIMIT_SCOPE = 'class';
            assert.strictEqual(limitFor('default', 'class'), 600);
            for (let i = 0; i < 600; i++) {
                assert.strictEqual(hit(`/api/random-${i}`, '203.0.113.9').allowed, true);
            }
            assert.strictEqual(hit('/api/anything-else', '203.0.113.9').allowed, false);
        });

        test('class scope keeps strict routes on their own bucket', () => {
            process.env.RATE_LIMIT_SCOPE = 'class';
            for (let i = 0; i < 60; i++) hit('/api/auth/github', '203.0.113.9');
            assert.strictEqual(hit('/api/auth/github', '203.0.113.9').allowed, false);
            assert.strictEqual(hit('/api/projects', '203.0.113.9').allowed, true);
        });
    });

    describe('report mode', () => {
        beforeEach(() => {
            process.env.RATE_LIMIT_MODE = 'report';
        });

        test('enforces the legacy decision while flagging what enforce would block', () => {
            let warned: string | null = null;
            for (let i = 0; i < 60; i++) {
                const v = hit('/api/auth/github', `10.0.0.${i}, 203.0.113.9`);
                assert.strictEqual(v.allowed, true, 'report must never reject');
                if (v.warning && v.warning.startsWith('would block')) warned = v.warning;
            }
            assert.ok(warned, 'expected a "would block" warning');
            assert.match(warned!, /203\.0\.113\.9/);
        });

        test('report still reports the legacy limit in the header value', () => {
            const v = hit('/api/auth/github', '1.2.3.4, 203.0.113.9');
            assert.strictEqual(v.limit, 30);
        });
    });

    describe('off mode', () => {
        test('never rejects and never touches the store', () => {
            process.env.RATE_LIMIT_MODE = 'off';
            for (let i = 0; i < 500; i++) {
                assert.strictEqual(hit('/api/auth/github', '203.0.113.9').allowed, true);
            }
            assert.strictEqual(rateLimitStoreSize(), 0);
        });
    });

    describe('store is bounded (the memory-exhaustion primitive)', () => {
        test('unbounded distinct keys can no longer grow the store past the cap', () => {
            process.env.RATE_LIMIT_MAX_ENTRIES = '500';
            for (let i = 0; i < 20_000; i++) {
                checkRateLimit(`attacker:${i}`, 100, 60_000);
            }
            assert.ok(
                rateLimitStoreSize() <= 500,
                `store grew to ${rateLimitStoreSize()}, expected <= 500`
            );
        });

        test('eviction only ever resets a counter, it never manufactures a 429', () => {
            process.env.RATE_LIMIT_MAX_ENTRIES = '100';
            for (let i = 0; i < 5_000; i++) {
                assert.strictEqual(checkRateLimit(`k:${i}`, 100, 60_000).allowed, true);
            }
        });

        test('over-long identifiers are bounded but stay distinct (no new 429s)', () => {
            const long = 'x'.repeat(10_000);
            assert.strictEqual(checkRateLimit(long, 2, 60_000).allowed, true);
            // A different long identifier sharing the same 160-char prefix must
            // NOT land in the same bucket, or truncation would invent a 429.
            assert.strictEqual(checkRateLimit(`${long}-other`, 2, 60_000).allowed, true);
            assert.strictEqual(checkRateLimit(`${long}-other`, 2, 60_000).allowed, true);
            assert.strictEqual(checkRateLimit(`${long}-other`, 2, 60_000).allowed, false);
            // ...and the original identifier is untouched by that.
            assert.strictEqual(checkRateLimit(long, 2, 60_000).allowed, true);
            assert.strictEqual(checkRateLimit(long, 2, 60_000).allowed, false);
        });

        test('a very long real API path is bucketed on its own, exactly as before', () => {
            process.env.RATE_LIMIT_MODE = 'legacy';
            const a = `/api/v1/proxy/tenant-a/${'deep/'.repeat(60)}index.html`;
            const b = `/api/v1/proxy/tenant-a/${'deep/'.repeat(60)}other.html`;
            for (let i = 0; i < 100; i++) hit(a, '203.0.113.9');
            assert.strictEqual(hit(a, '203.0.113.9').allowed, false);
            assert.strictEqual(hit(b, '203.0.113.9').allowed, true);
        });
    });

    describe('policy helpers', () => {
        test('classifyRoute matches the pre-fix strictRateLimitRoutes list', () => {
            assert.strictEqual(classifyRoute('/api/auth/github'), 'strict');
            assert.strictEqual(classifyRoute('/api/webhooks/github'), 'strict');
            assert.strictEqual(classifyRoute('/api/projects'), 'default');
        });

        test('bad env values fall back to the safe default instead of throwing', () => {
            process.env.TRUSTED_PROXY_HOPS = 'not-a-number';
            assert.strictEqual(getTrustedProxyHops(), 1);
            process.env.TRUSTED_PROXY_HOPS = '-5';
            assert.strictEqual(getTrustedProxyHops(), 1);
            process.env.RATE_LIMIT_MODE = 'nonsense';
            assert.strictEqual(getRateLimitMode(), 'legacy');
        });
    });
});
