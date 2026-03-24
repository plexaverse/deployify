import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';

/**
 * PATCH - Update a specific saved query
 * DELETE - Delete a specific saved query
 */
export async function PATCH(
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
        const { name, query } = body;

        const db = getDb();
        const docRef = db.collection(Collections.SAVED_QUERIES).doc(queryId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Saved query not found' }, { status: 404 });
        }

        if (doc.data()?.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const now = new Date();
        const updateData: Record<string, unknown> = {
            updatedAt: now
        };

        if (name) updateData.name = name;
        if (query) updateData.query = query;

        await docRef.update(updateData);

        return NextResponse.json({ success: true, updatedAt: now.toISOString() });
    } catch (error) {
        console.error('Failed to update saved query:', error);
        return NextResponse.json({ error: 'Failed to update saved query' }, { status: 500 });
    }
}

export async function DELETE(
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

        const db = getDb();
        const docRef = db.collection(Collections.SAVED_QUERIES).doc(queryId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Saved query not found' }, { status: 404 });
        }

        if (doc.data()?.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await docRef.delete();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete saved query:', error);
        return NextResponse.json({ error: 'Failed to delete saved query' }, { status: 500 });
    }
}
