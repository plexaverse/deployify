import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { detectPerformanceRegressions } from '@/lib/gcp/monitoring';
import { getLatestDeployment } from '@/lib/db';
import type { StorageConfig } from '@/types';

/**
 * Fetch performance regression report for a storage connector
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const { id, storageId } = await params;
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        if (!storageConfig) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        // Get the latest successful deployment as the event to analyze
        const deployment = await getLatestDeployment(id, 'production');
        if (!deployment || !deployment.readyAt) {
            return NextResponse.json({
                success: true,
                report: {
                    hasRegression: false,
                    severity: 'none',
                    metrics: { latencyDelta: 0, errorRateDelta: 0, p99Delta: 0 },
                    regressedQueries: [],
                    timestamp: new Date().toISOString(),
                    reason: 'No successful production deployment found for analysis.'
                }
            });
        }

        const { searchParams } = new URL(request.url);
        const lookbackHours = parseInt(searchParams.get('lookbackHours') || '12', 10);

        const report = await detectPerformanceRegressions(
            id,
            storageId,
            deployment.readyAt,
            { lookbackHours, deploymentId: deployment.id }
        );

        return NextResponse.json({
            success: true,
            report
        });

    } catch (error) {
        console.error('Failed to detect performance regressions:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to analyze performance'
        }, { status: 500 });
    }
}
