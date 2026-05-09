import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { detectCachingOpportunities } from '@/lib/gcp/monitoring';
import type { StorageConfig } from '@/types';

/**
 * Fetch telemetry-driven caching recommendations (Phase 145)
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

        // Only SQL-like storages are currently supported for caching analysis
        if (!storage.type.includes('sql') && storage.type !== 'supabase' && storage.type !== 'neon' && storage.type !== 'planetscale') {
            return NextResponse.json({ success: true, recommendations: [] });
        }

        const recommendations = await detectCachingOpportunities(id, storageId);

        return NextResponse.json({
            success: true,
            recommendations
        });
    } catch (error) {
        console.error('[CachingOptimizationAPI] Fetch error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
