import { test, describe } from 'node:test';
import assert from 'node:assert';
import { maskString, maskData } from './masking';

describe('PII Masking Utility', () => {
    test('should mask emails', () => {
        const email = 'jules@deployify.app';
        const masked = maskString(email);
        assert.strictEqual(masked, 'j***@deployify.app');
    });

    test('should mask credit cards', () => {
        const cc = '1234-5678-9012-3456';
        const masked = maskString(cc);
        assert.strictEqual(masked, '****-****-****-3456');
    });

    test('should mask phone numbers', () => {
        const phone = '123-456-7890';
        const masked = maskString(phone);
        assert.strictEqual(masked, '***-***-****');
    });

    test('should recursively mask objects', () => {
        const data = {
            user: {
                name: 'Jules',
                email: 'jules@deployify.app',
                nested: {
                    phone: '123-456-7890'
                }
            },
            token: 'secret-api-token-1234567890',
            plain: 'normal text'
        };

        const masked = maskData(data);

        assert.strictEqual(masked.user.name, 'Jules');
        assert.strictEqual(masked.user.email, 'j***@deployify.app');
        assert.strictEqual(masked.user.nested.phone, '***-***-****');
        assert.strictEqual(masked.token, '********');
        assert.strictEqual(masked.plain, 'normal text');
    });

    test('should mask API tokens in strings', () => {
        const text = 'Use this key: auth-token-abcdefghijklmnop';
        const masked = maskString(text);
        assert.ok(masked.includes('auth****************'));
    });
});
