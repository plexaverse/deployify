import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';

/**
 * GET - Fetch query history for a specific storage connector
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

        if (process.env.MOCK_DB === 'true') {
            return NextResponse.json({
                success: true,
                history: [
                    { id: 'h1', query: 'SELECT * FROM users LIMIT 10', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), executionTimeMs: 45, rowCount: 10 },
                    { id: 'h2', query: 'DISCOVER_SCHEMA', timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), executionTimeMs: 120, rowCount: 1 },
                    { id: 'h3', query: 'SELECT name, email FROM projects', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), executionTimeMs: 32, rowCount: 5 },
                ]
            });
        }

        const db = getDb();
        const historySnapshot = await db
            .collection(Collections.QUERY_HISTORY)
            .where('projectId', '==', id)
            .where('storageId', '==', storageId)
            .where('userId', '==', session.user.id)
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();

        const history = historySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp
            };
        });

        return NextResponse.json({ success: true, history });
    } catch (error) {
        console.error('Failed to fetch query history:', error);
        return NextResponse.json({ error: 'Failed to fetch query history' }, { status: 500 });
    }
}
