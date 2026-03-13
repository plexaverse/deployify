import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

// Set env vars
process.env.GCP_PROJECT_ID = 'test-gcp-project';

import { updateProjectFirewall } from './firewall';

describe('updateProjectFirewall', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fetchMock: any; // Using any for the mock function to allow node:test mocking

    beforeEach(() => {
        fetchMock = mock.fn();
        global.fetch = fetchMock;
    });

    it('should create policy if not exists and add rules', async () => {
        const projectSlug = 'my-project';
        const ipRules = {
            allow: ['1.2.3.4'],
            block: ['5.6.7.8']
        };
        const accessToken = 'fake-token';

        // Smart mock implementation based on URL/Method
        fetchMock.mock.mockImplementation(async (urlInput: URL | string, optionsInput?: RequestInit) => {
            const url = urlInput.toString();
            const options = optionsInput || {};

            // 1. Get Policy
            if (url.endsWith('/securityPolicies/dfy-my-project-policy') && (!options.method || options.method === 'GET')) {
                return { status: 404, ok: false };
            }

            // 2. Create Policy
            if (url.endsWith('/securityPolicies') && options.method === 'POST') {
                return {
                    ok: true,
                    json: async () => ({
                        selfLink: 'https://compute.googleapis.com/compute/v1/projects/test-gcp-project/global/operations/create-op',
                        status: 'PENDING'
                    })
                };
            }

            // 3. Add Rules
            if (url.includes('/addRule')) {
                return {
                    ok: true,
                     json: async () => ({
                        selfLink: 'https://compute.googleapis.com/compute/v1/projects/test-gcp-project/global/operations/add-op',
                        status: 'PENDING'
                    })
                };
            }

            // 4. Remove Rules
            if (url.includes('/removeRule')) {
                return {
                    ok: true,
                     json: async () => ({
                        selfLink: 'https://compute.googleapis.com/compute/v1/projects/test-gcp-project/global/operations/remove-op',
                        status: 'PENDING'
                    })
                };
            }

            // 5. Poll Operation
            if (url.includes('/global/operations/')) {
                 return {
                     ok: true,
                     json: async () => ({ status: 'DONE' })
                 };
            }

            return { ok: false, status: 500, statusText: 'Unexpected call: ' + url };
        });

        await updateProjectFirewall(projectSlug, ipRules, accessToken);

        // Assertions
        // Calls:
        // 1. Get
        // 2. Create
        // 3. Poll Create (1 call)
        // 4. Add Block
        // 5. Poll Add Block
        // 6. Add Allow
        // 7. Poll Add Allow
        // 8. Add DenyAll
        // 9. Poll Add DenyAll
        // Total 9 calls

        assert.ok(fetchMock.mock.callCount() >= 5);

        // Check Create
        interface MockCall { arguments: [string | URL, RequestInit?] }
        const createCall = fetchMock.mock.calls.find((c: MockCall) => c.arguments[0].toString().endsWith('/securityPolicies') && c.arguments[1]?.method === 'POST');
        assert.ok(createCall, 'Should create policy');

        // Check Rules
        const addCalls = fetchMock.mock.calls.filter((c: MockCall) => c.arguments[0].toString().includes('/addRule'));
        assert.strictEqual(addCalls.length, 3, 'Should add 3 rules');

        // Check Polling
        const pollCalls = fetchMock.mock.calls.filter((c: MockCall) => c.arguments[0].toString().includes('/global/operations/'));
        assert.strictEqual(pollCalls.length, 4, 'Should poll 4 operations (1 create + 3 adds)');
    });

    it('should update existing policy and chunk rules', async () => {
         const projectSlug = 'my-project-2';
         // Generate 12 IPs for block to test chunking (limit 10)
         const blockIps = Array.from({ length: 12 }, (_, i) => `10.0.0.${i}`);
         const ipRules = {
             allow: [],
             block: blockIps
         };
         const accessToken = 'fake-token';

         fetchMock.mock.mockImplementation(async (urlInput: URL | string) => {
            const url = urlInput.toString();

            // Get Policy
            if (url.endsWith('/securityPolicies/dfy-my-project-2-policy')) {
                 return {
                     ok: true,
                     json: async () => ({
                         name: 'dfy-my-project-2-policy',
                         rules: [
                             { priority: 1000, description: 'Old rule' },
                             { priority: 0, description: 'System rule' }
                         ]
                     })
                 };
            }

            // Remove/Add
            if (url.includes('/removeRule') || url.includes('/addRule')) {
                return {
                    ok: true,
                     json: async () => ({
                        selfLink: 'https://compute.googleapis.com/compute/v1/projects/test-gcp-project/global/operations/op',
                        status: 'PENDING'
                    })
                };
            }

            // Poll Operation
            if (url.includes('/global/operations/')) {
                 return {
                     ok: true,
                     json: async () => ({ status: 'DONE' })
                 };
            }

            return { ok: false, status: 500, statusText: 'Unexpected call' };
        });

         await updateProjectFirewall(projectSlug, ipRules, accessToken);

         // Assertions
         // Check Remove
         interface MockCall { arguments: [string | URL, RequestInit?] }
         const removeCall = fetchMock.mock.calls.find((c: MockCall) => c.arguments[0].toString().includes('removeRule?priority=1000'));
         assert.ok(removeCall, 'Should remove rule 1000');

         // Check Add
         const addCallsCount = fetchMock.mock.calls.filter((c: MockCall) => c.arguments[0].toString().includes('/addRule'));
         assert.strictEqual(addCallsCount.length, 2, 'Should add 2 block chunks');

         // Check Polling (1 remove + 2 adds = 3)
         const pollCallsCount = fetchMock.mock.calls.filter((c: MockCall) => c.arguments[0].toString().includes('/global/operations/'));
         assert.strictEqual(pollCallsCount.length, 3, 'Should poll 3 operations');
    });
});
