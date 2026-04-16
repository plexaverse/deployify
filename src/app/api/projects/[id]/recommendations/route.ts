import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getCloudSqlHistoricalMetrics, getScalingRecommendations } from '@/lib/gcp/monitoring';
import { securityHeaders } from '@/lib/security';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        const { id } = await params;

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: securityHeaders });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status, headers: securityHeaders });
        }

        const { project } = access;
        const recommendations = [];

        // Analyze each provisioned storage config
        const storageConfigs = project.storageConfigs || [];
        for (const storage of storageConfigs) {
            if (storage.metadata?.provisioned && storage.type.includes('cloud-sql')) {
                const resourceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');

                // Fetch last 7 days of metrics
                const historicalMetrics = await getCloudSqlHistoricalMetrics(resourceName, 7);

                if (historicalMetrics.length > 0) {
                    // Get average metrics for analysis
                    const avgMetrics = historicalMetrics.reduce((acc, curr) => ({
                        cpuUtilization: acc.cpuUtilization + curr.cpuUtilization,
                        memoryUtilization: acc.memoryUtilization + curr.memoryUtilization,
                        diskUtilization: (acc.diskUtilization || 0) + (curr.diskUtilization || 0),
                        timestamp: curr.timestamp
                    }), { cpuUtilization: 0, memoryUtilization: 0, diskUtilization: 0, timestamp: '' });

                    const count = historicalMetrics.length;
                    const metrics = {
                        cpuUtilization: avgMetrics.cpuUtilization / count,
                        memoryUtilization: avgMetrics.memoryUtilization / count,
                        diskUtilization: (avgMetrics.diskUtilization || 0) / count,
                        timestamp: new Date().toISOString()
                    };

                    const storageRecs = await getScalingRecommendations(
                        storage.type,
                        metrics,
                        {
                            tier: storage.metadata?.tier,
                            diskSizeGb: storage.metadata?.diskSizeGb
                        }
                    );

                    if (storageRecs.length > 0) {
                        recommendations.push({
                            storageId: storage.id,
                            storageName: storage.name,
                            recommendations: storageRecs,
                            metrics
                        });
                    }
                }
            }
        }

        return NextResponse.json({ success: true, recommendations }, { headers: securityHeaders });
    } catch (error) {
        console.error('Failed to get recommendations:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: securityHeaders });
    }
}
