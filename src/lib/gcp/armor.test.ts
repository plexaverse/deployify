import { describe, it, mock } from 'node:test';
import assert from 'node:assert';

process.env.GCP_PROJECT_ID = 'test-gcp-project';

import { enableCloudArmor } from './armor';

describe('enableCloudArmor', () => {
    it('should resolve successfully', async () => {
        // Mock global fetch
        const fetchMock = mock.fn(async (url: URL | string | Request) => {
             if (url.toString().includes('metadata.google.internal')) {
                 return {
                     ok: true,
                     json: async () => ({ access_token: 'mock-token' })
                 } as unknown as Response;
             }
             return { ok: true } as unknown as Response;
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        await enableCloudArmor('test-service');
        assert.ok(true);
    });
});
