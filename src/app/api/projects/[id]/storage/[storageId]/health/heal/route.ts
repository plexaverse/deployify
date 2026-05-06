import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { terminateIdleSessions } from '@/lib/gcp/cloudsql';
import { logAuditEvent } from '@/lib/audit';
import type { StorageConfig } from '@/types';

/**
 * Trigger connection pool healing by terminating idle sessions (Phase 141)
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const body = await request.json();
        const { clientAddress } = body;

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storage = project.storageConfigs?.find((s: StorageConfig) => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storage.type.includes('cloud-sql') && storage.type !== 'supabase' && storage.type !== 'neon') {
            return NextResponse.json({ success: false, error: 'Healing is only supported for SQL-based connectors' }, { status: 400 });
        }

        const connectionString = storage.connectionStringSecretId
            ? await getSecretValue(storage.connectionStringSecretId)
            : '';

        if (!connectionString) {
            return NextResponse.json({ success: false, error: 'Connection string not found' }, { status: 400 });
        }

        const dbType = (storage.type.includes('postgres') || storage.type === 'supabase' || storage.type === 'neon') ? 'postgres' : 'mysql';

        const { terminatedCount } = await terminateIdleSessions(
            connectionString,
            dbType as 'postgres' | 'mysql',
            clientAddress,
            { ssl: !!storage.ssl }
        );

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'storage.heal_connection_pool',
            {
                projectId: id,
                storageId,
                storageName: storage.name,
                clientAddress: clientAddress || 'all',
                terminatedCount
            }
        );

        return NextResponse.json({
            success: true,
            message: `Healed connection pool: ${terminatedCount} idle sessions terminated.`,
            terminatedCount
        });

    } catch (error) {
        console.error('[HealthHeal] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error during healing'
        }, { status: 500 });
    }
}
