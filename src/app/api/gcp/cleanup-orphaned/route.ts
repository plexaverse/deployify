import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { logAuditEvent } from '@/lib/audit';

/**
 * POST - Bulk cleanup orphaned GCP database resources
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { projectId, resources = [] } = body;

        if (!projectId) {
            return NextResponse.json({ error: 'Deployify Project ID is required' }, { status: 400 });
        }

        if (resources.length === 0) {
            return NextResponse.json({ error: 'No resources provided for cleanup' }, { status: 400 });
        }

        // 1. Verify user has access to the Deployify project (needs admin/owner)
        const access = await checkProjectAccess(session.user.id, projectId);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        if (access.role === 'viewer' || access.role === 'member') {
            return NextResponse.json({ error: 'Forbidden: Insufficient permissions for resource cleanup' }, { status: 403 });
        }

        const results: { id: string; type: string; success: boolean; error?: string }[] = [];

        // 2. Perform bulk deletion
        for (const res of resources) {
            try {
                if (res.type === 'cloud-sql') {
                    const { deleteInstance } = await import('@/lib/gcp/cloudsql');
                    await deleteInstance(res.id);
                } else if (res.type === 'memorystore-redis') {
                    const { deleteInstance } = await import('@/lib/gcp/memorystore');
                    await deleteInstance(res.id, res.region);
                } else if (res.type === 'firestore') {
                    const { deleteDatabase } = await import('@/lib/gcp/firestore-admin');
                    await deleteDatabase(res.id);
                }

                results.push({ id: res.id, type: res.type, success: true });
            } catch (e) {
                console.error(`[Cleanup] Failed to delete ${res.type} resource ${res.id}:`, e);
                results.push({
                    id: res.id,
                    type: res.type,
                    success: false,
                    error: e instanceof Error ? e.message : 'Unknown error'
                });
            }
        }

        await logAuditEvent(
            access.project.teamId || null,
            session.user.id,
            'storage.orphaned_cleanup',
            {
                projectId,
                cleanedCount: results.filter(r => r.success).length,
                failedCount: results.filter(r => !r.success).length,
                results
            }
        );

        return NextResponse.json({
            success: true,
            results
        });
    } catch (error) {
        console.error('Failed to perform orphaned resource cleanup:', error);
        return NextResponse.json({
            error: 'Failed to perform cleanup',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
