import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSchemaOptimizations } from '@/lib/gcp/monitoring';
import type { StorageConfig } from '@/types';

/**
 * Fetch telemetry-driven schema optimization recommendations (Phase 137)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storage = project.storageConfigs?.find((s: StorageConfig) => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const dbType = storage.type.includes('postgres') || storage.type === 'supabase' || storage.type === 'neon' ? 'postgresql' : 'mysql';

        const recommendations = await getSchemaOptimizations(id, storageId, dbType);

        return NextResponse.json({
            success: true,
            recommendations
        });
    } catch (error) {
        console.error('[SchemaOptimizationAPI] Fetch error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
