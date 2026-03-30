import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';

/**
 * Handle query comments
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string; queryId: string }> }
) {
    try {
        const { id, queryId } = await params;
        const session = await getSession();

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const db = getDb();
        const commentsSnapshot = await db.collection(Collections.QUERY_COMMENTS)
            .where('queryId', '==', queryId)
            .orderBy('createdAt', 'desc')
            .get();

        const comments = commentsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
            };
        });

        return NextResponse.json({ success: true, comments });
    } catch (error) {
        console.error('Failed to fetch comments:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string; queryId: string }> }
) {
    try {
        const { id, queryId } = await params;
        const session = await getSession();

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const { text } = await request.json();
        if (!text?.trim()) {
            return NextResponse.json({ error: 'Comment text is required' }, { status: 400 });
        }

        const db = getDb();
        const comment = {
            queryId,
            userId: session.user.id,
            userName: session.user.name || session.user.githubUsername,
            userAvatar: session.user.avatarUrl,
            text: text.trim(),
            createdAt: new Date()
        };

        const docRef = await db.collection(Collections.QUERY_COMMENTS).add(comment);

        return NextResponse.json({
            success: true,
            comment: {
                id: docRef.id,
                ...comment,
                createdAt: comment.createdAt.toISOString()
            }
        });
    } catch (error) {
        console.error('Failed to post comment:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
