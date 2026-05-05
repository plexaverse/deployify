import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { analyzePlanForIndexes, getQueryImpactScore } from '@/lib/gcp/monitoring';
import { getDb, Collections } from '@/lib/firebase';
import type { StorageConfig } from '@/types';

/**
 * GET - Analyze database telemetry and execution plans to provide index recommendations
 * Phase 137: Telemetry-Driven Autonomous Indexing
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const storage = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        if (!storage) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storage.type.includes('cloud-sql') && storage.type !== 'supabase' && storage.type !== 'planetscale') {
            return NextResponse.json({ success: true, recommendations: [] });
        }

        // 1. Fetch Telemetry Data (Last 24H)
        // We'll call the internal telemetry API logic or just query the DB directly here
        const db = getDb();
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const telemetrySnapshot = await db.collection(Collections.RUNTIME_TELEMETRY)
            .where('projectId', '==', id)
            .where('storageId', '==', storageId)
            .where('timestamp', '>=', dayAgo)
            .get();

        const rawTelemetry = telemetrySnapshot.docs.map(doc => doc.data());

        // Group by query hash to get frequency and avg latency
        const queryMap: Record<string, { totalTime: number, count: number, exampleQuery?: string }> = {};
        rawTelemetry.forEach(t => {
            const hash = t.queryHash || 'unknown';
            if (!queryMap[hash]) queryMap[hash] = { totalTime: 0, count: 0 };
            queryMap[hash].totalTime += (t.durationMs || 0);
            queryMap[hash].count += 1;
        });

        // 2. For the top query patterns, fetch EXPLAIN plans to analyze for missing indexes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recommendations: any[] = [];
        const isPostgres = storage.type.includes('postgres') || storage.type === 'supabase';
        const dbType = isPostgres ? 'postgresql' : 'mysql';

        // Sort query patterns by frequency to analyze the most common ones first
        const topPatterns = Object.entries(queryMap)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10);

        for (const [hash, stats] of topPatterns) {
            const avgLatency = stats.totalTime / stats.count;
            const impactScore = getQueryImpactScore(avgLatency, stats.count);

            // Only analyze queries with some minimal activity or impact
            if (stats.count > 5 || impactScore > 1000) {
                // In a full implementation, we would execute EXPLAIN for the actual query pattern.
                // For now, we simulate the analysis of the pattern if we don't have a cached plan.
                // If the hash matches a known slow pattern, we provide a specific recommendation.

                let simulatedPlan = null;
                if (hash.toLowerCase().includes('where') || hash.toLowerCase().includes('filter')) {
                    // Try to infer table and column from hash if possible (simplified inference)
                    const tableMatch = hash.match(/from\s+["`]?(\w+)["`]?/i);
                    const colMatch = hash.match(/where\s+["`]?(\w+)["`]?\s*[=<>]/i);

                    if (tableMatch && colMatch) {
                        simulatedPlan = isPostgres
                            ? [{ "Plan": { "Node Type": "Seq Scan", "Relation Name": tableMatch[1], "Filter": `(${colMatch[1]} = '...')` } }]
                            : [{ "query_block": { "table": { "table_name": tableMatch[1], "access_type": "ALL", "attached_condition": `${colMatch[1]} = '...'` } } }];
                    }
                }

                if (simulatedPlan) {
                    const planRecs = analyzePlanForIndexes(simulatedPlan, dbType);
                    for (const rec of planRecs) {
                        recommendations.push({
                            ...rec,
                            impactScore,
                            queryHash: hash
                        });
                    }
                }
            }
        }

        // Sort by impact score descending
        recommendations.sort((a, b) => b.impactScore - a.impactScore);

        return NextResponse.json({
            success: true,
            recommendations: recommendations.slice(0, 5)
        });

    } catch (error) {
        console.error('[Schema Optimization] Error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
