import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';
import type { StorageConfig, StorageRbacSettings } from '@/types';

/**
 * GET - Fetch RBAC settings for a storage connector
 */
export async function GET(
    _request: NextRequest,
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

        const storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        if (!storageConfig) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            rbacSettings: storageConfig.rbacSettings || { enabled: false, rules: [], lastUpdated: new Date().toISOString() }
        });
    } catch (error) {
        console.error('Failed to fetch storage RBAC:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * PATCH - Update RBAC settings for a storage connector
 */
export async function PATCH(
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
        const { rbacSettings } = body as { rbacSettings: StorageRbacSettings };

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        // Restrict RBAC management to owners and admins
        if (access.role !== 'owner' && access.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden: Insufficient permissions to manage RBAC' }, { status: 403 });
        }

        const storageConfigs = access.project?.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        // Update RBAC settings
        storageConfigs[index] = {
            ...storageConfigs[index],
            rbacSettings: {
                ...rbacSettings,
                lastUpdated: new Date().toISOString()
            },
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
        console.error('Failed to update storage RBAC:', error);
        return NextResponse.json({
            success: false,
            error: `Failed to update RBAC settings: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, { status: 500 });
    }
}
