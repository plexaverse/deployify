import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';
import type { StorageConfig, StorageAlertSettings } from '@/types';

/**
 * POST - Update alert settings for a storage connector
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const body = await request.json();
        const { alerts } = body as { alerts: StorageAlertSettings };

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const storageConfigs = access.project?.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        // Update alert settings
        storageConfigs[index] = {
            ...storageConfigs[index],
            alertSettings: alerts,
            updatedAt: new Date()
        };

        const db = getDb();
        await db.collection(Collections.PROJECTS).doc(id).update({
            storageConfigs,
            updatedAt: new Date()
        });

        return NextResponse.json({
            success: true,
            storageConfig: storageConfigs[index]
        });
    } catch (error) {
        console.error('Failed to update storage alerts:', error);
        return NextResponse.json({
            success: false,
            error: `Failed to update alert settings: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, { status: 500 });
    }
}
