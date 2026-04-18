import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getCloudSqlMetrics, getMemorystoreMetrics, getExternalMetrics } from '@/lib/gcp/monitoring';
import type { StorageConfig } from '@/types';

/**
 * GET - Fetch real-time infrastructure resource metrics for a specific storage connector
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

        const storageConfig = access.project?.storageConfigs?.find((s: StorageConfig) => s.id === storageId);
        if (!storageConfig) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        // Metrics are only available for provisioned GCP resources or managed external connectors
        const isExternal = ['supabase', 'mongodb-atlas', 'neon'].includes(storageConfig.type);
        if (!storageConfig.metadata?.provisioned && !isExternal) {
            return NextResponse.json({
                success: false,
                error: 'Resource metrics are only available for provisioned GCP-native or managed external connectors'
            }, { status: 400 });
        }

        const resourceName = storageConfig.name.toLowerCase().replace(/\s+/g, '-');
        const region = (storageConfig.metadata?.region as string) || access.project?.region || 'us-central1';

        let metrics;
        if (storageConfig.type.includes('cloud-sql')) {
            metrics = await getCloudSqlMetrics(resourceName);
        } else if (storageConfig.type === 'memorystore-redis') {
            metrics = await getMemorystoreMetrics(resourceName, region);
        } else if (isExternal) {
            const ext = await getExternalMetrics(storageConfig.type, storageConfig.metadata || {});
            metrics = {
                cpuUtilization: ext.usage || 0,
                memoryUtilization: 0, // Not all providers return memory via project API
                status: ext.status,
                timestamp: new Date().toISOString()
            };
        } else {
            return NextResponse.json({
                success: false,
                error: `Metrics not supported for connector type: ${storageConfig.type}`
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            metrics
        });
    } catch (error) {
        console.error('Failed to fetch resource metrics:', error);
        return NextResponse.json({
            success: false,
            error: `Failed to fetch real-time metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, { status: 500 });
    }
}
