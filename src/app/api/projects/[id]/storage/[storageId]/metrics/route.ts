import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';
import { getQueryInsights, getExternalQueryInsights } from '@/lib/gcp/monitoring';
import { getSecretValue } from '@/lib/gcp/secrets';
import type { StorageConfig } from '@/types';

/**
 * GET - Fetch historical performance metrics for a specific storage connector
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        // In mock mode, return simulated metrics
        if (process.env.MOCK_DB === 'true') {
            return NextResponse.json({
                success: true,
                stats: {
                    avgLatency: 28,
                    successRate: 99.2,
                    totalQueries: 154,
                    timeseries: Array.from({ length: 7 }).map((_, i) => ({
                        date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        avgLatency: Math.floor(Math.random() * 20) + 20,
                        successRate: 95 + Math.random() * 5
                    })),
                    hotspots: [
                        { query: 'SELECT * FROM large_table', avgLatency: 1200, count: 5 },
                        { query: 'SELECT * FROM users JOIN orders ON users.id = orders.userId', avgLatency: 850, count: 12 }
                    ]
                }
            });
        }

        const db = getDb();
        const metricsSnapshot = await db
            .collection(Collections.STORAGE_METRICS)
            .where('projectId', '==', id)
            .where('storageId', '==', storageId)
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        if (metricsSnapshot.empty) {
            return NextResponse.json({
                success: true,
                stats: {
                    avgLatency: 0,
                    successRate: 0,
                    totalQueries: 0,
                    timeseries: []
                }
            });
        }

        const docs = metricsSnapshot.docs.map(doc => doc.data());
        const totalQueries = docs.length;
        const successfulQueries = docs.filter(d => d.success).length;
        const avgLatency = docs.reduce((acc, d) => acc + (d.executionTimeMs || 0), 0) / totalQueries;
        const successRate = (successfulQueries / totalQueries) * 100;

        // Group by day for timeseries
        const dayMap = new Map<string, { latencies: number[], successes: number, total: number }>();
        docs.forEach(d => {
            const date = (d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp)).toISOString().split('T')[0];
            if (!dayMap.has(date)) {
                dayMap.set(date, { latencies: [], successes: 0, total: 0 });
            }
            const day = dayMap.get(date)!;
            day.latencies.push(d.executionTimeMs || 0);
            if (d.success) day.successes++;
            day.total++;
        });

        const timeseries = Array.from(dayMap.entries())
            .map(([date, data]) => ({
                date,
                avgLatency: data.latencies.reduce((a, b) => a + b, 0) / data.total,
                successRate: (data.successes / data.total) * 100
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Identify hotspots (slowest unique queries)
        const hotspotsMap = new Map<string, { totalLatency: number, count: number }>();
        docs.forEach(d => {
            if (d.query && (d.executionTimeMs >= 1000)) {
                const q = d.query as string;
                if (!hotspotsMap.has(q)) {
                    hotspotsMap.set(q, { totalLatency: 0, count: 0 });
                }
                const stats = hotspotsMap.get(q)!;
                stats.totalLatency += d.executionTimeMs;
                stats.count++;
            }
        });

        const hotspots = Array.from(hotspotsMap.entries())
            .map(([query, data]) => ({
                query,
                avgLatency: Math.round(data.totalLatency / data.count),
                count: data.count
            }))
            .sort((a, b) => b.avgLatency - a.avgLatency)
            .slice(0, 5);


        // Fetch production query insights if available
        let queryInsights: { query: string, avgLatency: number, count: number }[] = [];
        try {
            const storageConfigs = (access.project.storageConfigs as StorageConfig[]) || [];
            const storage = storageConfigs.find(s => s.id === storageId);
            if (storage && storage.type.includes('cloud-sql')) {
                const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                const dbType = storage.type === 'cloud-sql-mysql' ? 'mysql' : 'postgresql';
                queryInsights = await getQueryInsights(resourceName, dbType);
            } else if (storage && ['neon', 'supabase', 'planetscale'].includes(storage.type)) {
                let connectionString = '';
                if (storage.metadata?.connectionString) {
                    connectionString = storage.metadata.connectionString as string;
                } else if (storage.connectionStringSecretId) {
                    try {
                        connectionString = await getSecretValue(storage.connectionStringSecretId);
                    } catch (e) {
                        console.error(`[MetricsAPI] Failed to fetch secret for ${storage.id}`, e);
                    }
                }

                if (connectionString) {
                    queryInsights = await getExternalQueryInsights(storage.type, connectionString);
                }
            }
        } catch (insightsErr) {
            console.warn(`[MetricsAPI] Failed to fetch query insights for ${storageId}:`, insightsErr);
        }


        return NextResponse.json({
            success: true,
            stats: {
                avgLatency: Math.round(avgLatency),
                successRate: parseFloat(successRate.toFixed(1)),
                totalQueries,
                timeseries,
                hotspots: queryInsights.length > 0 ? queryInsights : hotspots
            }
        });
    } catch (error) {
        console.error('Failed to fetch storage metrics:', error);
        return NextResponse.json({ error: 'Failed to fetch storage metrics' }, { status: 500 });
    }
}
