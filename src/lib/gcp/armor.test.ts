import { describe, it, mock } from 'node:test';
import assert from 'node:assert';

process.env.GCP_PROJECT_ID = 'test-gcp-project';

import { enableCloudArmor } from './armor';

describe('enableCloudArmor', () => {
    it('should resolve successfully', async () => {
        // Mock global fetch
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fetchMock = mock.fn(async (url: any) => {
             if (url.toString().includes('metadata.google.internal')) {
                 return {
                     ok: true,
                     json: async () => ({ access_token: 'mock-token' })
                 };
             }
             return { ok: true };
        });
        global.fetch = fetchMock;

        await enableCloudArmor('test-service');
        assert.ok(true);
    });
});
