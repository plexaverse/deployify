import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
    checkProxyTarget,
    fetchWithSsrfGuard,
    getProxySsrfMode,
    isBlockedIpv4,
    isBlockedIpv6,
    ProxyTargetBlockedError,
    resetProxyTargetCache,
} from './ssrf';

describe('SSRF guard - address classification', () => {
    test('blocks the GCP metadata address and RFC1918/loopback space', () => {
        for (const ip of ['169.254.169.254', '127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.0.1', '192.168.1.1', '100.64.0.1']) {
            assert.strictEqual(isBlockedIpv4(ip), true, `${ip} should be blocked`);
        }
    });

    test('allows ordinary public IPv4', () => {
        for (const ip of ['142.250.183.14', '8.8.8.8', '34.117.59.81']) {
            assert.strictEqual(isBlockedIpv4(ip), false, `${ip} should be allowed`);
        }
    });

    test('blocks IPv6 loopback, ULA, link-local and IPv4-mapped metadata', () => {
        for (const ip of ['::1', '::', 'fd00::1', 'fe80::1', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe']) {
            assert.strictEqual(isBlockedIpv6(ip), true, `${ip} should be blocked`);
        }
        assert.strictEqual(isBlockedIpv6('2606:4700:4700::1111'), false);
    });
});

describe('SSRF guard - checkProxyTarget', () => {
    beforeEach(() => resetProxyTargetCache());

    test('rejects metadata hostnames, non-http schemes and embedded credentials', async () => {
        assert.strictEqual((await checkProxyTarget('http://metadata.google.internal/computeMetadata/v1/')).safe, false);
        assert.strictEqual((await checkProxyTarget('http://169.254.169.254/')).safe, false);
        assert.strictEqual((await checkProxyTarget('http://[::1]:8080/')).safe, false);
        assert.strictEqual((await checkProxyTarget('file:///etc/passwd')).safe, false);
        assert.strictEqual((await checkProxyTarget('http://user:pw@example.com/')).safe, false);
        assert.strictEqual((await checkProxyTarget('http://127.0.0.1.nip.io/')).safe, false);
    });

    test('allows a normal Cloud Run production URL', async () => {
        const verdict = await checkProxyTarget('https://dfy-demo-1234567890.asia-south1.run.app/');
        assert.strictEqual(verdict.safe, true);
    });
});

describe('SSRF guard - getProxySsrfMode', () => {
    const originalMode = process.env.PROXY_SSRF_MODE;
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
        if (originalMode === undefined) delete process.env.PROXY_SSRF_MODE;
        else process.env.PROXY_SSRF_MODE = originalMode;
        process.env.NODE_ENV = originalEnv;
    });

    test('defaults to enforce in production and report elsewhere', () => {
        delete process.env.PROXY_SSRF_MODE;
        process.env.NODE_ENV = 'production';
        assert.strictEqual(getProxySsrfMode(), 'enforce');
        process.env.NODE_ENV = 'development';
        assert.strictEqual(getProxySsrfMode(), 'report');
    });

    test('honours the explicit kill switch', () => {
        process.env.PROXY_SSRF_MODE = 'off';
        assert.strictEqual(getProxySsrfMode(), 'off');
    });
});

describe('SSRF guard - fetchWithSsrfGuard redirect handling', () => {
    const realFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = realFetch;
        resetProxyTargetCache();
    });

    test('blocks a tenant redirect to the metadata server and never issues that request', async () => {
        const seen: string[] = [];
        globalThis.fetch = (async (input: string | URL | Request) => {
            const url = String(input);
            seen.push(url);
            return new Response(null, {
                status: 302,
                headers: { location: 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token' },
            });
        }) as typeof fetch;

        await assert.rejects(
            () => fetchWithSsrfGuard('https://dfy-evil-1.asia-south1.run.app/', { method: 'GET' }, 'enforce'),
            (err: unknown) => err instanceof ProxyTargetBlockedError
        );
        assert.deepStrictEqual(seen, ['https://dfy-evil-1.asia-south1.run.app/']);
    });

    test('follows a benign same-origin redirect exactly like redirect: follow', async () => {
        const seen: string[] = [];
        globalThis.fetch = (async (input: string | URL | Request) => {
            const url = String(input);
            seen.push(url);
            if (url.endsWith('/')) {
                return new Response(null, { status: 302, headers: { location: '/home' } });
            }
            return new Response('ok', { status: 200 });
        }) as typeof fetch;

        const res = await fetchWithSsrfGuard('https://dfy-demo-1.asia-south1.run.app/', { method: 'GET' }, 'enforce');
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(seen, [
            'https://dfy-demo-1.asia-south1.run.app/',
            'https://dfy-demo-1.asia-south1.run.app/home',
        ]);
    });

    test('report mode logs but still follows, preserving legacy behaviour', async () => {
        const seen: string[] = [];
        globalThis.fetch = (async (input: string | URL | Request) => {
            const url = String(input);
            seen.push(url);
            if (seen.length === 1) {
                return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:9999/x' } });
            }
            return new Response('local', { status: 200 });
        }) as typeof fetch;

        const res = await fetchWithSsrfGuard('http://localhost:3000/', { method: 'GET' }, 'report');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(seen.length, 2);
    });

    test('downgrades POST to GET and drops the body on a 303, per fetch semantics', async () => {
        const methods: string[] = [];
        const hadBody: boolean[] = [];
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            methods.push(String(init?.method));
            hadBody.push(init?.body !== undefined && init?.body !== null);
            if (methods.length === 1) {
                return new Response(null, { status: 303, headers: { location: '/done' } });
            }
            return new Response('done', { status: 200 });
        }) as typeof fetch;

        await fetchWithSsrfGuard(
            'https://dfy-demo-1.asia-south1.run.app/submit',
            { method: 'POST', body: new ArrayBuffer(8) },
            'enforce'
        );
        assert.deepStrictEqual(methods, ['POST', 'GET']);
        assert.deepStrictEqual(hadBody, [true, false]);
    });

    test('strips Cookie/Authorization when the redirect crosses an origin', async () => {
        const cookies: (string | null)[] = [];
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            const h = new Headers(init?.headers as HeadersInit | undefined);
            cookies.push(h.get('cookie'));
            if (cookies.length === 1) {
                return new Response(null, { status: 302, headers: { location: 'https://example.com/next' } });
            }
            return new Response('x', { status: 200 });
        }) as typeof fetch;

        await fetchWithSsrfGuard(
            'https://dfy-demo-1.asia-south1.run.app/',
            { method: 'GET', headers: { cookie: 'deployify_session=abc', authorization: 'Bearer t' } },
            'enforce'
        );
        assert.strictEqual(cookies[0], 'deployify_session=abc');
        assert.strictEqual(cookies[1], null);
    });

    test('off mode delegates straight to fetch with redirect: follow', async () => {
        let seenRedirect: RequestRedirect | undefined;
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            seenRedirect = init?.redirect;
            return new Response('legacy', { status: 200 });
        }) as typeof fetch;

        const res = await fetchWithSsrfGuard('http://169.254.169.254/', { method: 'GET' }, 'off');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(seenRedirect, 'follow');
    });
});
