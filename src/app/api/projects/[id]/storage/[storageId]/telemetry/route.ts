import { NextRequest, NextResponse } from 'next/server';
import { getDb, Collections } from '@/lib/firebase';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSession } from '@/lib/auth';

/**
 * Ingest query performance telemetry from application runtimes
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const body = await request.json();
        const { queryHash, durationMs, success, error, rowCount, timestamp } = body;

        // Note: For telemetry ingestion, we might allow a project-level API key
        // to avoid requiring a user session for app runtimes.
        // For now, we'll implement it with standard session check or
        // fallback to project-level identification for ease of integration.

        const session = await getSession();
        const apiKey = request.headers.get('x-deployify-api-key');

        if (!session && !apiKey) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Validate access
        if (session) {
            const access = await checkProjectAccess(session.user.id, id);
            if (!access.allowed) {
                return NextResponse.json({ success: false, error: access.error }, { status: access.status });
            }
        } else if (apiKey) {
            const db = getDb();
            const projectDoc = await db.collection(Collections.PROJECTS).doc(id).get();
            if (!projectDoc.exists || projectDoc.data()?.analyticsApiKey !== apiKey) {
                return NextResponse.json({ success: false, error: 'Invalid API Key' }, { status: 401 });
            }
        }

        const db = getDb();
        await db.collection(Collections.RUNTIME_TELEMETRY).add({
            projectId: id,
            storageId,
            queryHash: queryHash || 'unknown',
            durationMs: Number(durationMs) || 0,
            success: Boolean(success),
            error: error || null,
            rowCount: Number(rowCount) || 0,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            source: 'runtime'
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Telemetry] Ingestion error:', error);
        return NextResponse.json({ success: false, error: 'Failed to ingest telemetry' }, { status: 500 });
    }
}

/**
 * Fetch telemetry data with support for real-time aggregation and performance profiling
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const { searchParams } = new URL(request.url);
        const aggregate = searchParams.get('aggregate') === 'true';

        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const db = getDb();

        if (aggregate) {
            // Phase 136: Advanced Telemetry Intelligence
            // Fetch last 24 hours for profiling
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const snapshot = await db.collection(Collections.RUNTIME_TELEMETRY)
                .where('projectId', '==', id)
                .where('storageId', '==', storageId)
                .where('timestamp', '>=', dayAgo)
                .orderBy('timestamp', 'desc')
                .get();

            const rawData = snapshot.docs.map(doc => {
                const d = doc.data();
                return {
                    ...d,
                    durationMs: Number(d.durationMs) || 0,
                    success: Boolean(d.success),
                    queryHash: String(d.queryHash || 'unknown'),
                    timestamp: d.timestamp?.toDate?.() || d.timestamp
                };
            });

            if (rawData.length === 0) {
                return NextResponse.json({ success: true, data: { summary: null, timeseries: [], insights: [] } });
            }

            // 1. Calculate Summary (P90, P99, Error Rate)
            const sortedLatencies = rawData.map(d => Number(d.durationMs) || 0).sort((a, b) => a - b);
            const p90 = sortedLatencies[Math.floor(sortedLatencies.length * 0.9)];
            const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)];
            const errors = rawData.filter(d => !d.success).length;
            const errorRate = (errors / rawData.length) * 100;

            // 2. Performance Timeseries (Hourly buckets)
            const hourlyMap: Record<string, { total: number, count: number, timestamp: string }> = {};
            rawData.forEach(d => {
                const date = new Date(d.timestamp);
                date.setMinutes(0, 0, 0);
                const key = date.toISOString();
                if (!hourlyMap[key]) hourlyMap[key] = { total: 0, count: 0, timestamp: key };
                hourlyMap[key].total += (Number(d.durationMs) || 0);
                hourlyMap[key].count += 1;
            });

            const timeseries = Object.values(hourlyMap)
                .map(h => ({
                    timestamp: h.timestamp,
                    avgLatency: Math.round(h.total / h.count),
                    requestCount: h.count
                }))
                .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

            // 3. Query Insights (Top 5 slowest query patterns)
            const queryMap: Record<string, { total: number, count: number, max: number }> = {};
            rawData.forEach(d => {
                const hash = d.queryHash || 'unknown';
                if (!queryMap[hash]) queryMap[hash] = { total: 0, count: 0, max: 0 };
                queryMap[hash].total += (Number(d.durationMs) || 0);
                queryMap[hash].count += 1;
                queryMap[hash].max = Math.max(queryMap[hash].max, Number(d.durationMs) || 0);
            });

            const insights = Object.entries(queryMap)
                .map(([hash, stats]) => ({
                    queryHash: hash,
                    avgLatency: Math.round(stats.total / stats.count),
                    maxLatency: stats.max,
                    count: stats.count
                }))
                .sort((a, b) => b.avgLatency - a.avgLatency)
                .slice(0, 5);

            return NextResponse.json({
                success: true,
                data: {
                    summary: {
                        p90,
                        p99,
                        errorRate: parseFloat(errorRate.toFixed(2)),
                        totalRequests: rawData.length
                    },
                    timeseries,
                    insights
                }
            });
        }

        // Standard recent list view
        const snapshot = await db.collection(Collections.RUNTIME_TELEMETRY)
            .where('projectId', '==', id)
            .where('storageId', '==', storageId)
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
        }));

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('[Telemetry] Fetch error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch telemetry' }, { status: 500 });
    }
}
