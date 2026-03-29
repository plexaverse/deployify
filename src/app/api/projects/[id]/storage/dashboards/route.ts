import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';

/**
 * Manage dashboard widgets for a project's storage
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const db = getDb();
        const widgets: any[] = [];

        if (process.env.MOCK_DB === 'true') {
            widgets.push({
                id: 'mock-widget-1',
                name: 'MOCK WIDGET',
                query: 'SELECT * FROM users',
                storageId: 'mock-storage-id',
                isPublic: true,
                refreshInterval: 0,
                createdAt: new Date()
            });
        } else {
            const snapshot = await db.collection(Collections.PROJECTS).doc(id).collection('storage_dashboards').orderBy('createdAt', 'desc').get();
            widgets.push(...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }

        return NextResponse.json({
            success: true,
            widgets
        });
    } catch (error) {
        console.error('Dashboard fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const body = await request.json();
        const { name, query, chartConfig, storageId, isPublic, refreshInterval } = body;

        if (!name || !query || !storageId) {
            return NextResponse.json({ error: 'Name, query, and storageId are required' }, { status: 400 });
        }

        const db = getDb();
        const docRef = await db.collection(Collections.PROJECTS).doc(id).collection('storage_dashboards').add({
            name,
            query,
            chartConfig: chartConfig || null,
            storageId,
            isPublic: !!isPublic,
            refreshInterval: refreshInterval || 0, // 0 means no auto-refresh
            userId: session.user.id,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return NextResponse.json({
            success: true,
            id: docRef.id
        });
    } catch (error) {
        console.error('Dashboard creation error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
