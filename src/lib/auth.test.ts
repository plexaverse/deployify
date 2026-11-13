import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';

const env = process.env as Record<string, string | undefined>;
const original = { NODE_ENV: env.NODE_ENV, MOCK_DB: env.MOCK_DB };

afterEach(() => {
    env.NODE_ENV = original.NODE_ENV;
    env.MOCK_DB = original.MOCK_DB;
});

/**
 * getSession() needs next/headers, which is not available outside a request scope, so these
 * pin the DECISION the mock-session branch makes rather than calling it end to end. The
 * condition below is copied verbatim from src/lib/auth.ts getSession().
 */
function mockSessionWouldBeServed(): boolean {
    const isProduction = process.env.NODE_ENV === 'production';
    return !isProduction && (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true');
}

describe('MOCK_SESSION reachability', () => {
    test('served in development', () => {
        env.NODE_ENV = 'development';
        delete env.MOCK_DB;
        assert.strictEqual(mockSessionWouldBeServed(), true);
    });

    test('served when MOCK_DB=true outside production', () => {
        env.NODE_ENV = 'test';
        env.MOCK_DB = 'true';
        assert.strictEqual(mockSessionWouldBeServed(), true);
    });

    test('NEVER served in production, even with MOCK_DB=true', () => {
        env.NODE_ENV = 'production';
        env.MOCK_DB = 'true';
        assert.strictEqual(
            mockSessionWouldBeServed(), false,
            'a stray MOCK_DB on a production revision must not serve an admin session'
        );
    });

    test('not served in production with no flags', () => {
        env.NODE_ENV = 'production';
        delete env.MOCK_DB;
        assert.strictEqual(mockSessionWouldBeServed(), false);
    });
});
