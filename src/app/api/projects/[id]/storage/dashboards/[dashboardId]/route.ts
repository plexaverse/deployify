import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';

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
