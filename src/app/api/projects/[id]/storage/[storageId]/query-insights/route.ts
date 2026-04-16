import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getQueryInsights } from '@/lib/gcp/monitoring';
import type { StorageConfig } from '@/types';

/**
 * GET - Fetch top slow queries from GCP Cloud SQL Query Insights
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const storage = storageConfigs.find((s: StorageConfig) => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storage.type.includes('cloud-sql')) {
            return NextResponse.json({
                success: true,
                insights: []
            });
        }

        const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
        const dbType = storage.type === 'cloud-sql-mysql' ? 'mysql' : 'postgresql';
        const insights = await getQueryInsights(resourceName, dbType);

        return NextResponse.json({
            success: true,
            insights
        });

    } catch (error) {
        console.error('Query insights error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch query insights'
        }, { status: 500 });
    }
}
