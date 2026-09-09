
import assert from 'node:assert';
import { test, mock, describe, beforeEach, before } from 'node:test';

// Set up mocks before importing the module under test
const limitCalls: number[] = [];

const mockSnapshot = () => ({
    empty: false,
    size: 1,
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
});

const mockDb = {
    collection: mock.fn(() => ({
        where: mock.fn(() => ({
            where: mock.fn(() => ({
                orderBy: mock.fn(() => ({
                    // The production query caps the scan with .limit() unless
                    // ANALYTICS_MAX_EVENT_SCAN=0, so the chain must offer both.
                    limit: mock.fn((n: number) => {
                        limitCalls.push(n);
                        return { get: mock.fn(async () => mockSnapshot()) };
                    }),
                    get: mock.fn(async () => mockSnapshot())
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(mock as any).module('@/lib/firebase', {
    namedExports: {
        getDb: () => mockDb,
        Collections: { ANALYTICS_EVENTS: 'analytics_events' }
    }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(mock as any).module('@google-cloud/bigquery', {
    namedExports: {
        BigQuery: class {
            constructor() { return mockBigQueryInstance as unknown as import('@google-cloud/bigquery').BigQuery; }
            query: unknown = mockBigQueryInstance.query;
        }
    }
});

describe('getAnalyticsStats', () => {
    before(() => {
        delete process.env.MOCK_DB;
    });

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

        mockDb.collection.mock.mockImplementationOnce(() => ({
            where: () => ({
                where: () => ({
                    orderBy: () => ({
                        limit: () => ({ get: async () => ({ empty: true, size: 0, docs: [] }) }),
                        get: async () => ({ empty: true, size: 0, docs: [] })
                    })
                })
            })
        }) as unknown as ReturnType<typeof mockDb.collection>);

        const stats = await getAnalyticsStats('proj_123', '30d');

        assert.ok(stats);
        // Mock data usually has many days
        assert.ok(stats?.timeseries.length > 1);
    });
});

describe('analytics period bounds', () => {
    test('preserves the exact day count for every period the dashboard emits', async () => {
        const { resolvePeriodDays } = await import('./analytics');

        // SegmentedControl in src/app/dashboard/[id]/analytics/page.tsx
        assert.strictEqual(resolvePeriodDays('1h'), 1);
        assert.strictEqual(resolvePeriodDays('24h'), 24);
        assert.strictEqual(resolvePeriodDays('7d'), 7);
        assert.strictEqual(resolvePeriodDays('30d'), 30);
        // Hand-typed / bookmarked values below the ceiling are untouched
        assert.strictEqual(resolvePeriodDays('90d'), 90);
        assert.strictEqual(resolvePeriodDays('365d'), 365);
        // Historical `|| 30` fallback
        assert.strictEqual(resolvePeriodDays('garbage'), 30);
        assert.strictEqual(resolvePeriodDays(undefined), 30);
        assert.strictEqual(resolvePeriodDays('0d'), 30);
    });

    test('clamps a hostile period instead of allocating from it', async () => {
        const { resolvePeriodDays, getMockData, DEFAULT_MAX_PERIOD_DAYS } = await import('./analytics');

        assert.strictEqual(resolvePeriodDays('999999999d'), DEFAULT_MAX_PERIOD_DAYS);
        assert.strictEqual(resolvePeriodDays('-5d'), 30);

        // The OOM sink: getMockData must not build a billion Dates.
        const stats = getMockData('999999999d');
        assert.strictEqual(stats.timeseries.length, DEFAULT_MAX_PERIOD_DAYS);
    });

    test('ANALYTICS_MAX_PERIOD_DAYS raises the ceiling without a deploy', async () => {
        const { resolvePeriodDays } = await import('./analytics');

        process.env.ANALYTICS_MAX_PERIOD_DAYS = '30';
        try {
            assert.strictEqual(resolvePeriodDays('90d'), 30);
        } finally {
            delete process.env.ANALYTICS_MAX_PERIOD_DAYS;
        }
        assert.strictEqual(resolvePeriodDays('90d'), 90);
    });

    test('the Firestore query is uncapped until ANALYTICS_MAX_EVENT_SCAN is set', async () => {
        const { getAnalyticsStats, getMaxEventScan } = await import('./analytics');

        assert.strictEqual(getMaxEventScan(), 0);

        limitCalls.length = 0;
        mockBigQueryInstance.query.mock.mockImplementationOnce(async () => [[]]);
        await getAnalyticsStats('proj_123', '30d');

        // Stage 1 must not move a single tenant's numbers.
        assert.deepStrictEqual(limitCalls, []);
    });

    test('ANALYTICS_MAX_EVENT_SCAN enforces a .limit() when ops opts in', async () => {
        const { getAnalyticsStats } = await import('./analytics');

        limitCalls.length = 0;
        mockBigQueryInstance.query.mock.mockImplementationOnce(async () => [[]]);
        process.env.ANALYTICS_MAX_EVENT_SCAN = '5000';
        try {
            await getAnalyticsStats('proj_123', '30d');
        } finally {
            delete process.env.ANALYTICS_MAX_EVENT_SCAN;
        }

        assert.deepStrictEqual(limitCalls, [5000]);
    });
});
