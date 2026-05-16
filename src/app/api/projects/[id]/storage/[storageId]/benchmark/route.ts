import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { getSecretValue } from '@/lib/gcp/secrets';
import { runPerformanceBenchmark } from '@/lib/gcp/monitoring';
import { logAuditEvent } from '@/lib/audit';
import type { StorageConfig } from '@/types';

/**
 * Trigger a performance benchmark for a storage connector (Phase 159)
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
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];

        // RBAC: Only Owners and Admins can trigger benchmarks
        if (access.role === 'member' || access.role === 'viewer') {
             return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions to run benchmarks' }, { status: 403 });
        }

        let connectionString = '';
        if (storage.connectionStringSecretId) {
            connectionString = await getSecretValue(storage.connectionStringSecretId);
        }

        const report = await runPerformanceBenchmark(storage, connectionString);

        // Update project with the latest benchmark report
        storage.benchmarkReport = report;
        storage.updatedAt = new Date();
        storageConfigs[index] = storage;

        await updateProject(id, { storageConfigs });

        // Log audit event
        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'storage.run_benchmark',
            {
                projectId: id,
                storageId,
                storageName: storage.name,
                score: report.score,
                durationMs: report.totalDurationMs
            }
        );

        return NextResponse.json({
            success: true,
            report
        });

    } catch (error) {
        console.error('Storage benchmark error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error during benchmarking' }, { status: 500 });
    }
}
