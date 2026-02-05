import { test, mock } from 'node:test';
import assert from 'node:assert';

// Mock config by setting env vars before import
process.env.GCP_PROJECT_ID = 'test-project';
process.env.GCP_REGION = 'us-central1';

import { listCronJobs } from './scheduler';

test('listCronJobs', async (t) => {
    // Mock global fetch
    const fetchMock = mock.fn();
    global.fetch = fetchMock;

    t.beforeEach(() => {
        fetchMock.mock.resetCalls();
    });

    await t.test('should return filtered jobs with next run time', async () => {
        const mockJobsResponse = {
            jobs: [
                {
                    name: 'projects/test-project/locations/us-central1/jobs/dfy-my-slug-job1',
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
                    name: 'projects/test-project/locations/us-central1/jobs/other-job',
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
                    name: 'projects/test-project/locations/us-central1/jobs/dfy-my-slug-job2',
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
