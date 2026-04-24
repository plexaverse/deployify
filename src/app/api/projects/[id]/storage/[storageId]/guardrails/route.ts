import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getLongRunningQueries } from '@/lib/gcp/monitoring';
import type { StorageConfig } from '@/types';

/**
 * GET - Fetch long-running queries for a specific storage connector (Performance Guardrails)
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

        const storageConfigs = (access.project.storageConfigs as StorageConfig[]) || [];
        const storage = storageConfigs.find(s => s.id === storageId);

        if (!storage || !storage.type.includes('sql')) {
            return NextResponse.json({
                success: true,
                queries: []
            });
        }

        const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');


        const queries = await getLongRunningQueries(resourceName);

        return NextResponse.json({
            success: true,
            queries
        });
    } catch (error) {
        console.error('Failed to fetch guardrail queries:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
