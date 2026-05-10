import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { discoverIndexBloat } from '@/lib/gcp/monitoring';
import type { StorageConfig } from '@/types';

/**
 * Fetch autonomous index bloat analysis for a storage connector
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

        // Only support SQL-based types for bloat discovery
        if (!storage.type.includes('sql') && storage.type !== 'supabase' && storage.type !== 'neon' && storage.type !== 'planetscale') {
            return NextResponse.json({ success: true, report: { hasBloat: false, candidates: [], totalWastedMb: 0 } });
        }

        // If data is fresh (less than 1 hour old), return persisted metadata
        const existingReport = storage.metadata?.bloatReport as import('@/lib/gcp/monitoring').BloatReport | undefined;
        if (existingReport && (new Date().getTime() - new Date(existingReport.lastScannedAt).getTime() < 3600000)) {
            return NextResponse.json({ success: true, report: existingReport });
        }

        // Otherwise, perform real-time discovery (requires connection string)
        if (process.env.MOCK_DB === 'true') {
            const mockReport = await discoverIndexBloat(storage, '');
            return NextResponse.json({ success: true, report: mockReport });
        }

        const connectionString = storage.connectionStringSecretId ? await getSecretValue(storage.connectionStringSecretId) : '';
        if (!connectionString) {
            return NextResponse.json({ success: false, error: 'Connection string not available for analysis' }, { status: 400 });
        }

        const report = await discoverIndexBloat(storage, connectionString);
        return NextResponse.json({ success: true, report });

    } catch (error) {
        console.error('Bloat discovery API error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
