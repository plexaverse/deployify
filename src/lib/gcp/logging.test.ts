import { describe, it, mock } from 'node:test';
import assert from 'node:assert';

// Set environment variables to force isRunningOnGCP to true
process.env.GOOGLE_CLOUD_PROJECT = 'test-gcp-project';
process.env.GCP_PROJECT_ID = 'test-gcp-project';

import { listLogEntries } from './logging';

describe('listLogEntries', () => {
    const originalFetch = global.fetch;

    it('should include revision name in filter when provided', async () => {
        let requestBody: { filter?: string } | null = null;
        global.fetch = mock.fn(async (url: URL | string | Request, options?: RequestInit) => {
             if (url.toString().includes('metadata.google.internal')) {
                 return {
                     ok: true,
                     json: async () => ({ access_token: 'mock-token' })
                 } as unknown as Response;
             }
             if (url.toString().includes('logging.googleapis.com')) {
                 requestBody = JSON.parse(options?.body as string || '{}');
                 return {
                     ok: true,
                     json: async () => ({ entries: [] })
                 } as unknown as Response;
             }
             return { ok: true, json: async () => ({}) } as unknown as Response;
        });

        await listLogEntries('test-service', { revisionName: 'test-revision' });

        assert.ok(requestBody);
        assert.match((requestBody as { filter?: string }).filter || '', /resource.labels.revision_name="test-revision"/);
        assert.match((requestBody as { filter?: string }).filter || '', /resource.labels.service_name="test-service"/);

        global.fetch = originalFetch;
    });

    it('should not include revision name when not provided', async () => {
        let requestBody: { filter?: string } | null = null;
         global.fetch = mock.fn(async (url: URL | string | Request, options?: RequestInit) => {
             if (url.toString().includes('metadata.google.internal')) {
                 return {
                     ok: true,
                     json: async () => ({ access_token: 'mock-token' })
                 } as unknown as Response;
             }
             if (url.toString().includes('logging.googleapis.com')) {
                 requestBody = JSON.parse(options?.body as string || '{}');
                 return {
                     ok: true,
                     json: async () => ({ entries: [] })
                 } as unknown as Response;
             }
             return { ok: true, json: async () => ({}) } as unknown as Response;
        });

        await listLogEntries('test-service');

        assert.ok(requestBody);
        assert.doesNotMatch((requestBody as { filter?: string }).filter || '', /resource.labels.revision_name/);
        assert.match((requestBody as { filter?: string }).filter || '', /resource.labels.service_name="test-service"/);

        global.fetch = originalFetch;
    });

    it('should filter by build type and buildId', async () => {
        let requestBody: { filter?: string } | null = null;
        global.fetch = mock.fn(async (url: URL | string | Request, options?: RequestInit) => {
             if (url.toString().includes('metadata.google.internal')) {
                 return {
                     ok: true,
                     json: async () => ({ access_token: 'mock-token' })
                 } as unknown as Response;
             }
             if (url.toString().includes('logging.googleapis.com')) {
                 requestBody = JSON.parse(options?.body as string || '{}');
                 return {
                     ok: true,
                     json: async () => ({ entries: [] })
                 } as unknown as Response;
             }
             return { ok: true, json: async () => ({}) } as unknown as Response;
        });

        await listLogEntries('test-service', { logType: 'build', buildId: 'test-build-id' });

        assert.ok(requestBody);
        assert.match((requestBody as { filter?: string }).filter || '', /resource.type="build"/);
        assert.match((requestBody as { filter?: string }).filter || '', /resource.labels.build_id="test-build-id"/);

        global.fetch = originalFetch;
    });

    it('should filter by system type', async () => {
        let requestBody: { filter?: string } | null = null;
        global.fetch = mock.fn(async (url: URL | string | Request, options?: RequestInit) => {
             if (url.toString().includes('metadata.google.internal')) {
                 return {
                     ok: true,
                     json: async () => ({ access_token: 'mock-token' })
                 } as unknown as Response;
             }
             if (url.toString().includes('logging.googleapis.com')) {
                 requestBody = JSON.parse(options?.body as string || '{}');
                 return {
                     ok: true,
                     json: async () => ({ entries: [] })
                 } as unknown as Response;
             }
             return { ok: true, json: async () => ({}) } as unknown as Response;
        });

        await listLogEntries('test-service', { logType: 'system' });

        assert.ok(requestBody);
        assert.match((requestBody as { filter?: string }).filter || '', /resource.type="cloud_run_revision"/);
        assert.match((requestBody as { filter?: string }).filter || '', /NOT logName:"run.googleapis.com%2Fstdout"/);

        global.fetch = originalFetch;
    });
});
