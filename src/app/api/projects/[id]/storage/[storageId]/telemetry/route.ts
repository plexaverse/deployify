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
 * Fetch aggregated telemetry for visualization
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

        const db = getDb();
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
