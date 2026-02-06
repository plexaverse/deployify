
import { getAnalyticsStats } from './analytics';
import { strict as assert } from 'node:assert';
import { test, mock, describe, beforeEach, afterEach } from 'node:test';

describe('getAnalyticsStats', () => {
    let originalFetch: typeof global.fetch;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalFetch = global.fetch;
        originalEnv = { ...process.env };
        process.env.PLAUSIBLE_API_KEY = 'test-key';

        // Mock fetch
        global.fetch = mock.fn();
    });

    afterEach(() => {
        global.fetch = originalFetch;
        process.env = originalEnv;
    });

    test('fetches analytics data correctly', async () => {
        const mockAggregate = { results: { visitors: { value: 100 }, pageviews: { value: 200 }, bounce_rate: { value: 50 }, visit_duration: { value: 60 } } };
        const mockTimeseries = { results: [{ date: '2023-01-01', visitors: 10, pageviews: 20 }] };
        const mockSources = { results: [{ source: 'Google', visitors: 50 }] };
        const mockLocations = { results: [{ country: 'United States', visitors: 40 }] };

        (global.fetch as any).mock.mockImplementation(async (url: string) => {
            if (url.includes('/aggregate')) return { ok: true, json: async () => mockAggregate };
            if (url.includes('/timeseries')) return { ok: true, json: async () => mockTimeseries };
            if (url.includes('property=visit:source')) return { ok: true, json: async () => mockSources };
            if (url.includes('property=visit:country')) return { ok: true, json: async () => mockLocations };
            return { ok: false };
        });

        const stats = await getAnalyticsStats('example.com');

        assert.deepEqual(stats?.aggregate, mockAggregate.results);
        assert.deepEqual(stats?.timeseries, mockTimeseries.results);
        assert.deepEqual(stats?.sources, mockSources.results);
        assert.deepEqual(stats?.locations, mockLocations.results);
    });

    test('returns mock data when API key is missing', async () => {
        delete process.env.PLAUSIBLE_API_KEY;
        const stats = await getAnalyticsStats('example.com', '30d', undefined);

        assert.ok(stats);
        assert.ok(stats?.aggregate.visitors.value > 0);
        assert.ok(stats?.timeseries.length > 0);
        assert.ok(stats?.locations.length > 0);
    });

    test('handles API errors gracefully', async () => {
         (global.fetch as any).mock.mockImplementation(async () => ({ ok: false, status: 500 }));

         const stats = await getAnalyticsStats('example.com');
         assert.equal(stats, null);
    });
});
