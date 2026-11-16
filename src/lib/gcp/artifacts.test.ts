import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

process.env.GCP_PROJECT_ID = 'test-gcp-project';
process.env.GCP_ARTIFACT_REGISTRY = 'deployify-images';

import { ensureImageRepositoryExists } from './artifacts';

type Call = { url: string; method: string; body?: string };

const realFetch = global.fetch;

/**
 * Stub fetch, always answering the metadata token call, and route the rest through
 * `handler`. Returns the list of non-token calls so tests can assert on them.
 */
function stubFetch(handler: (call: Call) => Partial<Response> & { json?: () => Promise<unknown> }) {
    const calls: Call[] = [];
    global.fetch = (async (url: URL | string | Request, init?: RequestInit) => {
        const u = url.toString();
        if (u.includes('metadata.google.internal')) {
            return { ok: true, json: async () => ({ access_token: 'mock-token' }) } as unknown as Response;
        }
        const call: Call = { url: u, method: init?.method || 'GET', body: init?.body as string | undefined };
        calls.push(call);
        return handler(call) as unknown as Response;
    }) as unknown as typeof fetch;
    return calls;
}

const ok = (json: unknown = {}) => ({ ok: true, status: 200, json: async () => json, text: async () => '' });
const notFound = () => ({ ok: false, status: 404, json: async () => ({}), text: async () => 'not found' });

describe('ensureImageRepositoryExists', () => {
    beforeEach(() => { process.env.GCP_ARTIFACT_REGISTRY = 'deployify-images'; });
    afterEach(() => { global.fetch = realFetch; });

    it('does nothing when the repository already exists', async () => {
        const calls = stubFetch(() => ok());
        await ensureImageRepositoryExists('asia-south1');

        assert.strictEqual(calls.length, 1, 'should only probe, never create');
        assert.strictEqual(calls[0].method, 'GET');
        assert.ok(calls[0].url.endsWith('/locations/asia-south1/repositories/deployify-images'));
    });

    it('creates the repository in the requested region when it is missing', async () => {
        const calls = stubFetch((call) =>
            call.method === 'POST' ? ok({ done: true }) : notFound()
        );

        await ensureImageRepositoryExists('asia-northeast1');

        const create = calls.find((c) => c.method === 'POST');
        assert.ok(create, 'should issue a create call');
        // The region must be the one being deployed to, not the platform default.
        assert.ok(create.url.includes('/locations/asia-northeast1/repositories?'), create.url);
        assert.ok(create.url.includes('repositoryId=deployify-images'), create.url);
        assert.strictEqual(JSON.parse(create.body || '{}').format, 'DOCKER');
    });

    it('treats a concurrent creation (409) as success', async () => {
        stubFetch((call) =>
            call.method === 'POST'
                ? { ok: false, status: 409, json: async () => ({}), text: async () => 'ALREADY_EXISTS' }
                : notFound()
        );
        await assert.doesNotReject(() => ensureImageRepositoryExists('europe-west1'));
    });

    it('waits for a pending create operation before returning', async () => {
        let polled = 0;
        const calls = stubFetch((call) => {
            if (call.method === 'POST') return ok({ name: 'projects/p/locations/europe-west1/operations/op1', done: false });
            if (call.url.includes('/operations/op1')) { polled++; return ok({ done: true }); }
            return notFound();
        });

        await ensureImageRepositoryExists('europe-west1');
        assert.strictEqual(polled, 1, 'should poll the operation until it settles');
        assert.ok(calls.some((c) => c.url.includes('/operations/op1')));
    });

    it('throws when the create operation reports an error', async () => {
        stubFetch((call) => {
            if (call.method === 'POST') return ok({ name: 'projects/p/locations/us-east1/operations/op2', done: false });
            if (call.url.includes('/operations/op2')) return ok({ done: true, error: { message: 'quota exceeded' } });
            return notFound();
        });

        await assert.rejects(
            () => ensureImageRepositoryExists('us-east1'),
            /quota exceeded/
        );
    });

    it('surfaces a failed create instead of letting the push fail later', async () => {
        stubFetch((call) =>
            call.method === 'POST'
                ? { ok: false, status: 403, json: async () => ({}), text: async () => 'permission denied' }
                : notFound()
        );

        await assert.rejects(
            () => ensureImageRepositoryExists('asia-northeast1'),
            /permission denied/
        );
    });

    it('does not swallow a non-404 probe failure', async () => {
        stubFetch(() => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'backend error' }));

        await assert.rejects(
            () => ensureImageRepositoryExists('asia-northeast1'),
            /backend error/
        );
    });
});
