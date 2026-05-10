import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { discoverArchivalCandidates } from '@/lib/gcp/monitoring';
import type { StorageConfig } from '@/types';

/**
 * Discovery archival candidates for a storage connector (Phase 148)
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

        const storage = access.project.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        if (!storage) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        // Only SQL connectors support archival discovery
        if (!storage.type.includes('cloud-sql') && storage.type !== 'supabase' && storage.type !== 'neon') {
            return NextResponse.json({
                success: true,
                report: { hasCandidates: false, candidates: [], totalPotentialSavingsMonthly: 0, lastScannedAt: new Date().toISOString() }
            });
        }

        const connectionString = storage.connectionStringSecretId ? await getSecretValue(storage.connectionStringSecretId) : '';
        const report = await discoverArchivalCandidates(storage, connectionString);

        return NextResponse.json({
            success: true,
            report
        });

    } catch (error) {
        console.error('[ArchivalOptimizationAPI] Error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
