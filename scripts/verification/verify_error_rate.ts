import { test } from 'node:test';
import assert from 'node:assert';
import { getErrorRate } from '../../src/lib/gcp/logging';

// Set environment to force "on GCP" mode
process.env.K_SERVICE = 'test-service';
process.env.GCP_PROJECT_ID = 'test-project';

test('getErrorRate returns correct count from Cloud Logging', async () => {
  const originalFetch = global.fetch;

  // Mock fetch
  global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
    const urlStr = url.toString();

    // Mock Metadata Server for Token
    if (urlStr.includes('metadata.google.internal')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'mock-access-token' })
      } as Response;
    }

    // Mock Logging API
    if (urlStr.includes('logging.googleapis.com/v2/entries:list')) {
      // Verify body contains filter
      const body = JSON.parse(options?.body as string);
      if (!body.filter.includes('severity="ERROR"')) {
          throw new Error('Filter missing severity="ERROR"');
      }

      return {
        ok: true,
        json: async () => ({
          entries: [
            { insertId: '1', severity: 'ERROR' },
            { insertId: '2', severity: 'ERROR' },
            { insertId: '3', severity: 'ERROR' }
          ],
          nextPageToken: null
        })
      } as Response;
    }

    return originalFetch(url, options);
  };

  try {
    const count = await getErrorRate('test-service', 24);
    console.log(`Error Count: ${count}`);
    assert.strictEqual(count, 3, 'Should return 3 errors');
  } finally {
    global.fetch = originalFetch;
    // Don't delete process.env.K_SERVICE here if other tests need it,
    // but better to clean up.
    delete process.env.K_SERVICE;
  }
});
