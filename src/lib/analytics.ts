import { getDb, Collections } from '@/lib/firebase';
import { AnalyticsStats, AnalyticsEvent } from '@/types';
import { config } from '@/lib/config';

interface BQRow {
    date: string;
    visitors: number;
    pageviews: number;
}

/**
 * The analytics window is caller-controlled: `?period=` on
 * GET /api/projects/[id]/analytics/stats is read straight off the query string
 * and reaches three amplifying sinks - the BigQuery INTERVAL, the Firestore
 * `timestamp >=` predicate, and `Array.from({ length: days })` in getMockData().
 * Nothing bounded it, so `?period=999999999d` was a one-request OOM.
 *
 * Defaults are deliberately far above anything the dashboard can emit
 * (SegmentedControl offers 1h / 24h / 7d / 30d) so no existing caller changes
 * behaviour. See env.example for the escape hatches.
 */
export const DEFAULT_MAX_PERIOD_DAYS = 365;

/**
 * Doc count at which a stats read is worth shouting about. Used as the *warning*
 * threshold while ANALYTICS_MAX_EVENT_SCAN is unset, and as the suggested value
 * once ops decides to enforce a cap. Not a default cap - truncating a busy
 * tenant's totals without measuring first would be a silent product change.
 */
export const EVENT_SCAN_WARN_THRESHOLD = 50_000;

/** Matches the historical `parseInt(...) || 30` fallback. */
const FALLBACK_PERIOD_DAYS = 30;

/** Resolved at call time (not module load) so tests and Cloud Run env edits both take effect. */
export function getMaxPeriodDays(): number {
    const raw = Number(process.env.ANALYTICS_MAX_PERIOD_DAYS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_PERIOD_DAYS;
}

/**
 * 0 (the default, and what unset / garbage resolves to) means "no .limit() on the
 * query" - byte-for-byte today's Firestore read. A positive value enforces a cap.
 * Stage 2 of this fix: measure with the warn log, then set the number.
 */
export function getMaxEventScan(): number {
    const raw = Number(process.env.ANALYTICS_MAX_EVENT_SCAN);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

/**
 * Historical semantics preserved exactly for every value the UI can produce:
 *   '1h' -> 1, '24h' -> 24, '7d' -> 7, '30d' -> 30, garbage/absent -> 30.
 * ('24h' has always meant 24 *days* here. That is pre-existing and intentionally
 * left alone - correcting it would move numbers on a live dashboard.)
 * Only unreachable-from-the-UI inputs change: above the ceiling now clamps, and
 * <= 0 now takes the same 30-day default that '0d' already took.
 */
export function resolvePeriodDays(period: string | null | undefined): number {
    const parsed = parseInt(String(period ?? '').replace('d', ''));
    const days = Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_PERIOD_DAYS;
    return Math.min(days, getMaxPeriodDays());
}

async function getStatsFromBigQuery(projectId: string, days: number): Promise<BQRow[]> {
    if (process.env.MOCK_DB === 'true') {
        return [];
    }

    try {
        const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
        const { BigQuery } = await import('@google-cloud/bigquery');
        const bq = new BigQuery({
            projectId: gcpProjectId,
            credentials: {
                client_email: config.firebase.clientEmail,
                private_key: config.firebase.privateKey?.replace(/\\n/g, '\n'),
            },
        });

        const query = `
            SELECT 
                FORMAT_TIMESTAMP('%Y-%m-%d', timestamp) as date,
                COUNT(DISTINCT ip) as visitors,
                COUNT(*) as pageviews
            FROM \`${gcpProjectId}.${config.bigquery.dataset}.${config.bigquery.table}\`
            WHERE projectId = @projectId
            AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
            AND type = 'pageview'
            GROUP BY date
            ORDER BY date ASC
        `;

        const options = {
            query,
            params: { projectId, days },
        };

        const [rows] = await bq.query(options);
        return rows as BQRow[];
    } catch (error) {
        console.error('[BigQuery Aggregation Error]:', error);
        return [];
    }
}

export async function getAnalyticsStats(
    projectId: string,
    period: string = '30d'
): Promise<AnalyticsStats | null> {
    try {
        const days = resolvePeriodDays(period);

        // Strategy: If period > 24h, we could use BigQuery.
        // For now, let's try to fetch BQ data and merge or use as primary for history.
        const bqRows = await getStatsFromBigQuery(projectId, days);

        if (bqRows.length > 0) {

            const totalPageviews = bqRows.reduce((acc, row) => acc + Number(row.pageviews), 0);
            const totalVisitors = bqRows.reduce((acc, row) => acc + Number(row.visitors), 0);

            return {
                aggregate: {
                    visitors: { value: totalVisitors },
                    pageviews: { value: totalPageviews },
                    bounce_rate: { value: 0 },
                    visit_duration: { value: 0 },
                },
                timeseries: bqRows.map(row => ({
                    date: row.date,
                    visitors: row.visitors,
                    pageviews: row.pageviews
                })),
                sources: [],
                locations: [],
                performance: { lcp: 0, cls: 0, fid: 0, fcp: 0, ttfb: 0 }
            };
        }

        const now = new Date();
        const startDate = new Date();
        startDate.setDate(now.getDate() - days);

        // Query Firestore for events
        const db = getDb();
        const eventsQuery = db.collection(Collections.ANALYTICS_EVENTS)
            .where('projectId', '==', projectId)
            .where('timestamp', '>=', startDate)
            .orderBy('timestamp', 'desc');

        // Second belt, off by default: even a legitimate 30d window is unbounded in
        // document count on a busy project. Ordered desc, so a cap keeps the NEWEST
        // events. Until ANALYTICS_MAX_EVENT_SCAN is set we only observe, so no
        // tenant's totals move without someone deciding they should.
        const scanCap = getMaxEventScan();
        const snapshot = await (scanCap > 0 ? eventsQuery.limit(scanCap) : eventsQuery).get();

        if (scanCap > 0 && snapshot.size >= scanCap) {
            console.warn(`[Analytics] Event scan CAPPED at ${scanCap} docs for project ${projectId} (${days}d); totals are a recent-window subset.`);
        } else if (scanCap === 0 && snapshot.size >= EVENT_SCAN_WARN_THRESHOLD) {
            console.warn(`[Analytics] Uncapped event scan read ${snapshot.size} docs for project ${projectId} (${days}d); consider setting ANALYTICS_MAX_EVENT_SCAN.`);
        }

        if (snapshot.empty) {
            return getMockData(period);
        }

        const events = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as AnalyticsEvent) }));

        // Process data (Group by day)
        const dailyData: Record<string, { visitors: Set<string>, pageviews: number }> = {};
        const sources: Record<string, number> = {};
        const locations: Record<string, number> = {};
        const treatedPageviews = new Set<string>();

        events.forEach((event) => {
            if (!event.timestamp) return;
            // Handle both Firestore Timestamp and JS Date/String
            const timestamp = event.timestamp as unknown as { toDate?: () => Date };
            const ts = typeof timestamp.toDate === 'function'
                ? timestamp.toDate()
                : new Date(event.timestamp as string | number | Date);
            const date = ts.toISOString().split('T')[0];
            const ip = event.ip || 'unknown';
            const path = event.path || '/';

            if (!dailyData[date]) {
                dailyData[date] = { visitors: new Set(), pageviews: 0 };
            }

            if (event.type === 'pageview') {
                // Deduplicate: If same IP/Path in the same minute, count as 1
                // This prevents double-counting when both Edge Proxy and SDK log the visit
                const minuteKey = `${ip}:${path}:${date}:${ts.getHours()}:${ts.getMinutes()}`;
                if (!treatedPageviews.has(minuteKey)) {
                    treatedPageviews.add(minuteKey);
                    dailyData[date].pageviews++;
                    dailyData[date].visitors.add(ip);

                    try {
                        const src = event.referrer ? new URL(event.referrer).hostname : 'Direct';
                        sources[src] = (sources[src] || 0) + 1;
                    } catch {
                        sources['Unknown'] = (sources['Unknown'] || 0) + 1;
                    }

                    locations['Unknown'] = (locations['Unknown'] || 0) + 1;
                }
            }
        });

        const timeseries = Object.entries(dailyData).map(([date, data]) => ({
            date,
            visitors: data.visitors.size,
            pageviews: data.pageviews
        })).sort((a, b) => a.date.localeCompare(b.date));

        const totalPageviews = timeseries.reduce((acc, curr) => acc + curr.pageviews, 0);
        const totalVisitors = new Set(events.map((e) => e.ip)).size;

        const vitals = events.filter((e) => e.type === 'vitals');
        const avgMetric = (metricName: keyof NonNullable<AnalyticsEvent['metrics']>) => {
            const values = vitals
                .map((e) => e.metrics?.[metricName])
                .filter((v): v is number => typeof v === 'number');
            if (values.length === 0) return 0;
            return values.reduce((a, b) => a + b, 0) / values.length;
        };

        return {
            aggregate: {
                visitors: { value: totalVisitors },
                pageviews: { value: totalPageviews },
                bounce_rate: { value: 0 },
                visit_duration: { value: 0 },
            },
            timeseries,
            sources: Object.entries(sources).map(([source, count]) => ({ source, visitors: count })),
            locations: Object.entries(locations).map(([country, count]) => ({ country, visitors: count })),
            performance: {
                lcp: avgMetric('lcp'),
                cls: avgMetric('cls'),
                fid: avgMetric('fid'),
                fcp: avgMetric('fcp'),
                ttfb: avgMetric('ttfb'),
            }
        };
    } catch (error) {
        console.error('Error fetching internal analytics:', error);
        return getMockData(period);
    }
}

export function getMockData(period: string): AnalyticsStats {
    // Exported, and reached from BOTH the empty-result branch and the catch-all
    // of getAnalyticsStats - so it bounds its own allocation rather than trusting
    // the caller to have done it.
    const days = resolvePeriodDays(period);
    const timeseries = Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        return {
            date: date.toISOString().split('T')[0],
            visitors: Math.floor(Math.random() * 100) + 20,
            pageviews: Math.floor(Math.random() * 200) + 50,
        };
    });

    const totalVisitors = timeseries.reduce((acc, curr) => acc + curr.visitors, 0);
    const totalPageviews = timeseries.reduce((acc, curr) => acc + curr.pageviews, 0);

    return {
        aggregate: {
            visitors: { value: totalVisitors },
            pageviews: { value: totalPageviews },
            bounce_rate: { value: 45 + Math.random() * 10 },
            visit_duration: { value: 60 + Math.random() * 60 },
        },
        timeseries,
        sources: [
            { source: 'Google', visitors: Math.floor(totalVisitors * 0.4) },
            { source: 'Direct', visitors: Math.floor(totalVisitors * 0.3) },
            { source: 'Twitter', visitors: Math.floor(totalVisitors * 0.2) },
            { source: 'GitHub', visitors: Math.floor(totalVisitors * 0.05) },
            { source: 'Other', visitors: Math.floor(totalVisitors * 0.05) },
        ],
        locations: [
            { country: 'United States', visitors: Math.floor(totalVisitors * 0.4) },
            { country: 'India', visitors: Math.floor(totalVisitors * 0.2) },
            { country: 'Germany', visitors: Math.floor(totalVisitors * 0.1) },
            { country: 'United Kingdom', visitors: Math.floor(totalVisitors * 0.1) },
            { country: 'Other', visitors: Math.floor(totalVisitors * 0.2) },
        ],
        performance: {
            lcp: 1200 + Math.random() * 400,
            cls: 0.05 + Math.random() * 0.05,
            fid: 10 + Math.random() * 15,
            fcp: 800 + Math.random() * 200,
            ttfb: 50 + Math.random() * 30,
        }
    };
}

export async function getRealtimeStats(projectId: string): Promise<{ visitors: number; pageviews: number }> {
    try {
        const fifteenMinsAgo = new Date();
        fifteenMinsAgo.setMinutes(fifteenMinsAgo.getMinutes() - 15);

        const db = getDb();
        const snapshot = await db.collection(Collections.ANALYTICS_EVENTS)
            .where('projectId', '==', projectId)
            .where('type', '==', 'pageview')
            .where('timestamp', '>=', fifteenMinsAgo)
            .get();

        if (snapshot.empty) {
            return { visitors: 0, pageviews: 0 };
        }

        const events = snapshot.docs.map(doc => doc.data() as AnalyticsEvent);
        const visitors = new Set(events.map((e) => e.ip || 'unknown')).size;

        return {
            visitors,
            pageviews: events.length
        };
    } catch (error) {
        console.error('Error fetching realtime stats:', error);
        return { visitors: 0, pageviews: 0 };
    }
}

export const trackEvent = async (eventName: string, props?: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;

    try {
        const projectId = document.currentScript?.getAttribute('data-project-id') || 'deployify-dashboard';
        const apiKey = document.currentScript?.getAttribute('data-api-key') || 'deployify-dashboard-internal';

        await fetch('/api/v1/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId,
                apiKey,
                type: eventName,
                path: window.location.pathname,
                referrer: document.referrer,
                props
            })
        });
    } catch (error) {
        console.error('Failed to track internal event:', error);
    }
};
