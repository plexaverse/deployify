import { test, mock } from 'node:test';
import assert from 'node:assert';
import { parseVercelConfig } from './config';

test('parseVercelConfig', async (t) => {
    // Mock fetcher function
    const fetcher = mock.fn();

    t.beforeEach(() => {
        fetcher.mock.resetCalls();
    });

    await t.test('should return null for invalid repo name', async () => {
        const result = await parseVercelConfig('invalid-repo', 'token', fetcher);
        assert.strictEqual(result, null);
        assert.strictEqual(fetcher.mock.callCount(), 0);
    });

    await t.test('should return null when vercel.json is missing', async () => {
        fetcher.mock.mockImplementation(async () => null);

        const result = await parseVercelConfig('owner/repo', 'token', fetcher);
        assert.strictEqual(result, null);
        assert.strictEqual(fetcher.mock.callCount(), 1);

        const args = fetcher.mock.calls[0].arguments;
        assert.deepStrictEqual(args, ['token', 'owner', 'repo', 'vercel.json']);
    });

    await t.test('should return null for invalid JSON', async () => {
        fetcher.mock.mockImplementation(async () => 'invalid-json');

        const result = await parseVercelConfig('owner/repo', 'token', fetcher);
        assert.strictEqual(result, null);
    });

    await t.test('should return config object for valid JSON', async () => {
        const validConfig = {
            crons: [
                { path: '/api/cron', schedule: '0 10 * * *' }
            ]
        };
        fetcher.mock.mockImplementation(async () => JSON.stringify(validConfig));

        const result = await parseVercelConfig('owner/repo', 'token', fetcher);
        assert.deepStrictEqual(result, validConfig);
    });

    await t.test('should return config object without crons', async () => {
        const validConfig = {
            buildCommand: 'npm run build'
        };
        fetcher.mock.mockImplementation(async () => JSON.stringify(validConfig));

        const result = await parseVercelConfig('owner/repo', 'token', fetcher);
        assert.deepStrictEqual(result, validConfig);
    });
});
