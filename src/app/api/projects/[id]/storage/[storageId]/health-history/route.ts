import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getHealthHistory } from '@/lib/gcp/storage-validator';
import type { StorageConfig } from '@/types';

/**
 * GET - Fetch historical connectivity health data for a storage connector
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
        const storageConfig = (project.storageConfigs || []).find((s: StorageConfig) => s.id === storageId);

        if (!storageConfig) {
            return NextResponse.json({ error: 'Storage configuration not found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '7', 10);

        const history = await getHealthHistory(storageId, days);

        return NextResponse.json({
            success: true,
            storageId,
            history
        });
    } catch (error) {
        console.error('Failed to fetch health history:', error);
        return NextResponse.json({
            error: 'Failed to fetch health history',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
