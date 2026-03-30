import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';

/**
 * GET - List comments for a saved query
 * POST - Add a new comment
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string; queryId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, queryId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        if (process.env.MOCK_DB === 'true') {
            return NextResponse.json({
                success: true,
                comments: [
                    { id: 'c1', text: 'Good query for monitoring user growth.', userId: 'audit-test', userName: 'Lead Developer', createdAt: new Date().toISOString() },
                    { id: 'c2', text: 'Should we add a filter for active users?', userId: 'user-2', userName: 'Junior Dev', createdAt: new Date().toISOString() }
                ]
            });
        }

        const db = getDb();
        const commentsSnapshot = await db
            .collection(Collections.QUERY_COMMENTS)
            .where('queryId', '==', queryId)
            .orderBy('createdAt', 'asc')
            .get();

        const comments = commentsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
            };
        });

        return NextResponse.json({ success: true, comments });
    } catch (error) {
        console.error('Failed to fetch query comments:', error);
        return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string; queryId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, queryId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const body = await request.json();
        const { text } = body;

        if (!text || !text.trim()) {
            return NextResponse.json({ error: 'Comment text is required' }, { status: 400 });
        }

        const db = getDb();
        const now = new Date();
        const commentData = {
            queryId,
            projectId: id,
            userId: session.user.id,
            userName: session.user.name || session.user.githubUsername,
            text: text.trim(),
            createdAt: now,
            updatedAt: now
        };

        const docRef = await db.collection(Collections.QUERY_COMMENTS).add(commentData);

        return NextResponse.json({
            success: true,
            comment: { id: docRef.id, ...commentData, createdAt: now.toISOString(), updatedAt: now.toISOString() }
        });
    } catch (error) {
        console.error('Failed to add query comment:', error);
        return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }
}
