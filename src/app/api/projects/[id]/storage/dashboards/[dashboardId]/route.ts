import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';

/**
 * Get a single dashboard widget (supporting public access)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; dashboardId: string }> }
) {
    try {
        const { id, dashboardId } = await params;

        if (process.env.MOCK_DB === 'true') {
            return NextResponse.json({
                success: true,
                widget: {
                    id: dashboardId,
                    name: 'MOCK WIDGET',
                    query: 'SELECT * FROM users',
                    storageId: 'mock-storage-id',
                    isPublic: true,
                    refreshInterval: 30,
                    createdAt: new Date()
                }
            });
        }

        const db = getDb();
        const doc = await db.collection(Collections.PROJECTS).doc(id).collection('storage_dashboards').doc(dashboardId).get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Dashboard widget not found' }, { status: 404 });
        }

        const widget = doc.data();

        // If not public, require session and access check
        if (!widget?.isPublic) {
            const session = await getSession();
            if (!session) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const access = await checkProjectAccess(session.user.id, id);
            if (!access.allowed) {
                return NextResponse.json({ error: access.error }, { status: access.status });
            }
        }

        return NextResponse.json({
            success: true,
            widget: { id: doc.id, ...widget }
        });
    } catch (error) {
        console.error('Dashboard fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * Update a dashboard widget
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; dashboardId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, dashboardId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const body = await request.json();
        const { name, chartConfig, isPublic, refreshInterval } = body;

        const db = getDb();
        const docRef = db.collection(Collections.PROJECTS).doc(id).collection('storage_dashboards').doc(dashboardId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Dashboard widget not found' }, { status: 404 });
        }

        const updateData: Record<string, unknown> = {
            updatedAt: new Date()
        };

        if (name !== undefined) updateData.name = name;
        if (chartConfig !== undefined) updateData.chartConfig = chartConfig;
        if (isPublic !== undefined) updateData.isPublic = isPublic;
        if (refreshInterval !== undefined) updateData.refreshInterval = refreshInterval;

        await docRef.update(updateData);

        return NextResponse.json({
            success: true
        });
    } catch (error) {
        console.error('Dashboard update error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * Remove a dashboard widget
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; dashboardId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, dashboardId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const db = getDb();
        await db.collection(Collections.PROJECTS).doc(id).collection('storage_dashboards').doc(dashboardId).delete();

        return NextResponse.json({
            success: true
        });
    } catch (error) {
        console.error('Dashboard deletion error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
