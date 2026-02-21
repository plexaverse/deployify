
import assert from 'node:assert';
import { test, mock, describe, beforeEach } from 'node:test';

// Set up mocks before importing the module under test
const mockDb = {
    collection: mock.fn(() => ({
        where: mock.fn(() => ({
            where: mock.fn(() => ({
                orderBy: mock.fn(() => ({
                    get: mock.fn(async () => ({
                        empty: false,
                        docs: [
                            {
                                id: 'event_1',
                                data: () => ({
                                    type: 'pageview',
                                    projectId: 'proj_123',
                                    path: '/',
                                    ip: '1.2.3.4',
                                    timestamp: { toDate: () => new Date() }
                                })
                            }
                        ]
                    }))
                }))
            }))
        }))
    }))
};

const mockBigQueryInstance = {
    query: mock.fn(async () => [
        [
            { date: '2023-01-01', visitors: 10, pageviews: 20 }
        ]
    ])
};

mock.module('@/lib/firebase', {
    namedExports: {
        getDb: () => mockDb,
        Collections: { ANALYTICS_EVENTS: 'analytics_events' }
    }
});

mock.module('@google-cloud/bigquery', {
    namedExports: {
        BigQuery: class {
            constructor() { return mockBigQueryInstance as any; }
            query = mockBigQueryInstance.query;
        }
    }
});

describe('getAnalyticsStats', () => {
    beforeEach(() => {
        mockDb.collection.mock.resetCalls();
        mockBigQueryInstance.query.mock.resetCalls();
    });

    test('prefers BigQuery data when available', async () => {
        // Dynamic import after mocking
        const { getAnalyticsStats } = await import('./analytics');

        const stats = await getAnalyticsStats('proj_123', '30d');

        assert.ok(stats);
        assert.strictEqual(stats?.timeseries.length, 1);
        assert.strictEqual(stats?.timeseries[0].visitors, 10);
        assert.strictEqual(mockBigQueryInstance.query.mock.callCount(), 1);
    });

    test('falls back to Firestore when BigQuery is empty', async () => {
        const { getAnalyticsStats } = await import('./analytics');

        // Mock BigQuery to return empty
        mockBigQueryInstance.query.mock.mockImplementationOnce(async () => [[]]);

        const stats = await getAnalyticsStats('proj_123', '30d');

        assert.ok(stats);
        assert.strictEqual(mockDb.collection.mock.callCount(), 1);
        assert.strictEqual(stats?.aggregate.pageviews.value, 1);
    });

    test('returns mock data when both BQ and Firestore are empty', async () => {
        const { getAnalyticsStats } = await import('./analytics');

        mockBigQueryInstance.query.mock.mockImplementationOnce(async () => [[]]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockDb.collection.mock.mockImplementationOnce(() => ({
            where: () => ({
                where: () => ({
                    orderBy: () => ({
                        get: async () => ({ empty: true, docs: [] })
                    })
                })
            })
        }) as any);

        const stats = await getAnalyticsStats('proj_123', '30d');

        assert.ok(stats);
        // Mock data usually has many days
        assert.ok(stats?.timeseries.length > 1);
    });
});
