import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';

/**
 * Get all schema documentation for a specific storage connector
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const db = getDb();
        const docsSnapshot = await db.collection(Collections.SCHEMA_DOCS)
            .where('projectId', '==', id)
            .where('storageId', '==', storageId)
            .get();

        const docs = docsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return NextResponse.json({ success: true, docs });
    } catch (error) {
        console.error('Failed to fetch schema documentation:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * Upsert schema documentation for a table or column
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const body = await request.json();
        const { entity, description, type } = body; // type: 'table' | 'column'

        if (!entity || !description || !type) {
            return NextResponse.json({ error: 'Entity, description, and type are required' }, { status: 400 });
        }

        const db = getDb();
        const docId = `${storageId}_${type}_${entity}`.replace(/[^a-z0-9]/gi, '_');

        await db.collection(Collections.SCHEMA_DOCS).doc(docId).set({
            projectId: id,
            storageId,
            entity,
            description,
            type,
            updatedAt: new Date(),
            updatedBy: session.user.id
        }, { merge: true });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to save schema documentation:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
