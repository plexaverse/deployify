import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';

/**
 * GET - List saved queries for a storage connector
 * POST - Save a new query
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
                queries: [
                    { id: 'q1', name: 'GET ALL USERS', query: 'SELECT * FROM users LIMIT 10', createdAt: new Date().toISOString(), isPublic: true },
                    { id: 'q2', name: 'ACTIVE PROJECTS', query: 'SELECT * FROM projects WHERE status = "ready"', createdAt: new Date().toISOString(), isPublic: false },
                ]
            });
        }

        const db = getDb();
        // Fetch queries that are either owned by the user OR are public within the project/storage
        const queriesSnapshot = await db
            .collection(Collections.SAVED_QUERIES)
            .where('projectId', '==', id)
            .where('storageId', '==', storageId)
            .orderBy('createdAt', 'desc')
            .get();

        const queries = queriesSnapshot.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate().toISOString() : doc.data().createdAt
            }))
            .filter((q: any) => q.userId === session.user.id || q.isPublic === true);

        return NextResponse.json({ success: true, queries });
    } catch (error) {
        console.error('Failed to fetch saved queries:', error);
        return NextResponse.json({ error: 'Failed to fetch saved queries' }, { status: 500 });
    }
}

export async function POST(
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

        const body = await request.json();
        const { name, query, isPublic = false } = body;

        if (!name || !query) {
            return NextResponse.json({ error: 'Name and query are required' }, { status: 400 });
        }

        const db = getDb();
        const now = new Date();
        const savedQuery = {
            projectId: id,
            storageId,
            userId: session.user.id,
            name,
            query,
            isPublic,
            createdAt: now,
            updatedAt: now
        };

        const docRef = await db.collection(Collections.SAVED_QUERIES).add(savedQuery);

        return NextResponse.json({
            success: true,
            query: { id: docRef.id, ...savedQuery, createdAt: now.toISOString(), updatedAt: now.toISOString() }
        });
    } catch (error) {
        console.error('Failed to save query:', error);
        return NextResponse.json({ error: 'Failed to save query' }, { status: 500 });
    }
}
