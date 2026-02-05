import assert from 'node:assert';
import { test } from 'node:test';
import { validateRepoContents } from './validator';

test('validateRepoContents', async (t) => {
    await t.test('should fail if package.json is missing', () => {
        const result = validateRepoContents([{ name: 'README.md', type: 'file' }]);
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes('Missing package.json'));
    });

    await t.test('should pass if only package.json is present', () => {
        const result = validateRepoContents([{ name: 'package.json', type: 'file' }]);
        assert.strictEqual(result.valid, true);
    });

    await t.test('should fail if multiple lock files are present', () => {
        const result = validateRepoContents([
            { name: 'package.json', type: 'file' },
            { name: 'package-lock.json', type: 'file' },
            { name: 'yarn.lock', type: 'file' }
        ]);
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes('Conflicting lock files'));
    });

    await t.test('should pass if single lock file is present', () => {
        const result = validateRepoContents([
            { name: 'package.json', type: 'file' },
            { name: 'package-lock.json', type: 'file' }
        ]);
        assert.strictEqual(result.valid, true);
    });

    await t.test('should fail if Next.js config is missing when framework is nextjs', () => {
        const result = validateRepoContents(
            [{ name: 'package.json', type: 'file' }],
            'nextjs'
        );
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes('Missing next.config.js'));
    });

    await t.test('should pass if Next.js config is present (js)', () => {
        const result = validateRepoContents(
            [
                { name: 'package.json', type: 'file' },
                { name: 'next.config.js', type: 'file' }
            ],
            'nextjs'
        );
        assert.strictEqual(result.valid, true);
    });

    await t.test('should pass if Next.js config is present (ts)', () => {
        const result = validateRepoContents(
            [
                { name: 'package.json', type: 'file' },
                { name: 'next.config.ts', type: 'file' }
            ],
            'nextjs'
        );
        assert.strictEqual(result.valid, true);
    });

    await t.test('should pass for unknown framework', () => {
        const result = validateRepoContents(
            [{ name: 'package.json', type: 'file' }],
            'unknown'
        );
        assert.strictEqual(result.valid, true);
    });
});
