import { describe, it, mock, beforeEach, before, test } from 'node:test';
import assert from 'node:assert';
import { Project } from '@/types';

// Set env vars before importing module under test (for shared config)
process.env.GCP_PROJECT_ID = 'test-gcp-project';
process.env.GCP_REGION = 'us-central1';
process.env.GITHUB_CLIENT_ID = 'mock';
process.env.GITHUB_CLIENT_SECRET = 'mock';
process.env.GITHUB_WEBHOOK_SECRET = 'mock';
process.env.JWT_SECRET = 'mock';
process.env.STRIPE_SECRET_KEY = 'mock';
process.env.RESEND_API_KEY = 'mock';

// Import the module under test
// Note: We need dynamic import or require to ensure re-import if env changed, 
// but since we set env once at top, we can use top level import if we want, 
// but sticking to require/import inside before if needed or just top.
// For mixed content, better to use what we had.

import { listCronJobs, syncCronJobs } from './scheduler';

// Mock data
const mockProject: Project = {
    id: 'proj-123',
    slug: 'my-project',
    region: 'us-central1',
    userId: 'user-1',
    name: 'My Project',
    repoFullName: 'owner/repo',
    repoUrl: 'https://github.com/owner/repo',
    defaultBranch: 'main',
    framework: 'nextjs',
    buildCommand: 'npm run build',
    installCommand: 'npm install',
    outputDirectory: '.next',
    rootDirectory: '.',
    cloudRunServiceId: 'service-1',
    productionUrl: null,
    customDomain: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('syncCronJobs', () => {
    // Mocks
    let mockGetGcpAccessToken: any;
    let mockGetProjectById: any;
    let mockGetService: any;
    let mockFetch: any;
    let dependencies: any;

    beforeEach(() => {
        mockGetGcpAccessToken = mock.fn(async () => 'mock-token');
        mockGetProjectById = mock.fn(async () => mockProject);
        // Default fetch success
        mockFetch = mock.fn(async () => ({
            ok: true,
            json: async () => ({}),
            text: async () => '',
        }));

        // Mock getService
        mockGetService = mock.fn(async () => ({
            name: 'dfy-my-project',
            uri: 'https://dfy-my-project-randomhash.us-central1.run.app',
            latestRevision: 'rev-1'
        }));

        dependencies = {
            getProjectById: mockGetProjectById,
            getGcpAccessToken: mockGetGcpAccessToken,
            fetch: mockFetch,
            getService: mockGetService,
        };
    });

    it('should create new cron jobs', async () => {
        const projectId = 'proj-123';
        const crons = [{ path: '/api/cron1', schedule: '0 0 * * *' }];

        // Mock list jobs (empty initially) - OVERRIDE for first call
        mockFetch.mock.mockImplementationOnce(async () => ({
            ok: true,
            json: async () => ({ jobs: [] }),
            text: async () => '',
        }));

        await syncCronJobs(projectId, crons, dependencies);

        // Verify fetching project
        assert.strictEqual(mockGetProjectById.mock.callCount(), 1);

        // Verify fetching service
        assert.strictEqual(mockGetService.mock.callCount(), 1);

        // Verify listing jobs
        const listCall = mockFetch.mock.calls[0];
        assert.match(listCall.arguments[0] as string, /projects\/.*\/locations\/us-central1\/jobs/);

        // Verify creating job
        assert.strictEqual(mockFetch.mock.callCount(), 2);
        const createCall = mockFetch.mock.calls[1];
        assert.strictEqual(createCall.arguments[1].method, 'POST');
        const body = JSON.parse(createCall.arguments[1].body);
        assert.strictEqual(body.schedule, '0 0 * * *');
        // Verify correct URI from getService mock
        assert.strictEqual(body.httpTarget.uri, 'https://dfy-my-project-randomhash.us-central1.run.app/api/cron1');
    });

    it('should update existing cron jobs', async () => {
        const projectId = 'proj-123';
        const crons = [{ path: '/api/cron1', schedule: '5 * * * *' }];

        const crypto = await import('crypto');
        const hash = crypto.createHash('sha256').update('/api/cron1').digest('hex').substring(0, 8);
        const expectedName = `projects/test-gcp-project/locations/us-central1/jobs/dfy-my-project-cron-${hash}`;

        // Mock list jobs (one exists)
        mockFetch.mock.mockImplementationOnce(async () => ({
            ok: true,
            json: async () => ({
                jobs: [{
                    name: expectedName,
                    schedule: '0 0 * * *'
                }]
            }),
            text: async () => '',
        }));

        await syncCronJobs(projectId, crons, dependencies);

        // Verify update call (PATCH)
        assert.strictEqual(mockFetch.mock.callCount(), 2);
        const updateCall = mockFetch.mock.calls[1];
        assert.strictEqual(updateCall.arguments[1].method, 'PATCH');
        const body = JSON.parse(updateCall.arguments[1].body);
        assert.strictEqual(body.schedule, '5 * * * *');
    });

    it('should delete removed cron jobs', async () => {
        const projectId = 'proj-123';
        const crons: any[] = []; // No crons desired

        const existingJobName = `projects/test-gcp-project/locations/us-central1/jobs/dfy-my-project-cron-oldhash`;

        mockFetch.mock.mockImplementationOnce(async () => ({
            ok: true,
            json: async () => ({
                jobs: [{
                    name: existingJobName
                }]
            }),
            text: async () => '',
        }));

        await syncCronJobs(projectId, crons, dependencies);

        // Verify delete call
        assert.strictEqual(mockFetch.mock.callCount(), 2);
        const deleteCall = mockFetch.mock.calls[1];
        assert.strictEqual(deleteCall.arguments[1].method, 'DELETE');
        assert.strictEqual(deleteCall.arguments[0], `https://cloudscheduler.googleapis.com/v1/${existingJobName}`);
    });

    it('should throw error if service not found', async () => {
        const projectId = 'proj-123';
        const crons = [{ path: '/api/cron1', schedule: '0 0 * * *' }];

        mockGetService.mock.mockImplementation(async () => null);

        await assert.rejects(
            async () => await syncCronJobs(projectId, crons, dependencies),
            { message: /Cloud Run service not found/ }
        );
    });
});

test('listCronJobs', async (t) => {
    // Mock global fetch for listCronJobs which uses global fetch or import from scheduler
    // Since listCronJobs uses `fetch` from global or imported, we should mock global.fetch here if it uses generic fetch
    // inspect scheduler.ts: it uses `fetch` directly globally or from simple import?
    // In our merged file, listCronJobs uses `fetch`. If it's not injected, it uses global `fetch`.
    
    // We can mock global.fetch
    const fetchMock = mock.fn();
    global.fetch = fetchMock;

    t.beforeEach(() => {
        fetchMock.mock.resetCalls();
    });

    await t.test('should return filtered jobs with next run time', async () => {
        const mockJobsResponse = {
            jobs: [
                {
                    name: 'projects/test-gcp-project/locations/us-central1/jobs/dfy-my-slug-job1',
                    schedule: '0 0 * * *', // Daily at midnight
                    timeZone: 'UTC',
                    state: 'ENABLED',
                    httpTarget: {
                        uri: 'https://service.run.app/api/cron/job1',
                        httpMethod: 'GET'
                    },
                    status: {
                        code: 0,
                        lastAttemptTime: '2023-01-01T00:00:00Z'
                    }
                },
                {
                    name: 'projects/test-gcp-project/locations/us-central1/jobs/other-job',
                    schedule: '0 0 * * *',
                    timeZone: 'UTC',
                    state: 'ENABLED'
                }
            ]
        };

        fetchMock.mock.mockImplementation(async () => {
            return {
                ok: true,
                json: async () => mockJobsResponse
            };
        });

        const jobs = await listCronJobs('my-slug', 'fake-token');

        assert.strictEqual(jobs.length, 1);
        assert.strictEqual(jobs[0].name, 'dfy-my-slug-job1');
        assert.strictEqual(jobs[0].path, '/api/cron/job1');
        assert.strictEqual(jobs[0].lastRunStatus, 'success');
        assert.ok(jobs[0].nextRunTime);
        assert.strictEqual(jobs[0].nextRunTime instanceof Date, true);
    });

    await t.test('should handle jobs with no status', async () => {
         const mockJobsResponse = {
            jobs: [
                {
                    name: 'projects/test-gcp-project/locations/us-central1/jobs/dfy-my-slug-job2',
                    schedule: '0 0 * * *',
                    timeZone: 'UTC',
                    state: 'ENABLED'
                }
            ]
        };
        fetchMock.mock.mockImplementation(async () => ({
            ok: true,
            json: async () => mockJobsResponse
        }));

        const jobs = await listCronJobs('my-slug', 'fake-token');
        assert.strictEqual(jobs.length, 1);
        assert.strictEqual(jobs[0].lastRunStatus, 'unknown');
    });
});
