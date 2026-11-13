import { test, describe } from 'node:test';
import assert from 'node:assert';
import { stripPlatformCookies, buildProxyRequestHeaders } from './proxy-headers';

describe('stripPlatformCookies', () => {
    test('removes the session cookie', () => {
        assert.strictEqual(stripPlatformCookies('deployify_session=abc.def.ghi'), null);
    });

    test('keeps a tenant app own cookies', () => {
        assert.strictEqual(stripPlatformCookies('sid=1; theme=dark'), 'sid=1; theme=dark');
    });

    test('removes only the platform cookie from a mixed header', () => {
        assert.strictEqual(
            stripPlatformCookies('sid=1; deployify_session=leak; theme=dark'),
            'sid=1; theme=dark'
        );
    });

    test('strips oauth_state and the CLI context cookie', () => {
        assert.strictEqual(stripPlatformCookies('oauth_state=x; deployify_cli_context=y'), null);
    });

    test('is case-insensitive on the cookie name', () => {
        assert.strictEqual(stripPlatformCookies('DEPLOYIFY_SESSION=abc'), null);
    });

    test('handles null and empty input', () => {
        assert.strictEqual(stripPlatformCookies(null), null);
        assert.strictEqual(stripPlatformCookies(''), null);
    });
});

describe('buildProxyRequestHeaders', () => {
    test('omits the Cookie header entirely when only platform cookies were present', () => {
        const inbound = new Headers({ cookie: 'deployify_session=leak', accept: 'text/html' });
        const out = buildProxyRequestHeaders(inbound);
        assert.strictEqual(out.get('cookie'), null);
        assert.strictEqual(out.get('accept'), 'text/html');
    });

    test('forwards a sanitized Cookie header', () => {
        const inbound = new Headers({ cookie: 'deployify_session=leak; sid=keep' });
        assert.strictEqual(buildProxyRequestHeaders(inbound).get('cookie'), 'sid=keep');
    });

    test('still drops hop-by-hop headers', () => {
        const inbound = new Headers({ host: 'evil', 'user-agent': 'ua' });
        const out = buildProxyRequestHeaders(inbound);
        assert.strictEqual(out.get('host'), null);
        assert.strictEqual(out.get('user-agent'), 'ua');
    });

    test('preserves Authorization for tenant apps', () => {
        const inbound = new Headers({ authorization: 'Bearer tenant-token' });
        assert.strictEqual(buildProxyRequestHeaders(inbound).get('authorization'), 'Bearer tenant-token');
    });
});
