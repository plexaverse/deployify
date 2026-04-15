import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listProjectsByUser, listProjectsByTeam } from '@/lib/db';
import type { Project, StorageConfig } from '@/types';

/**
 * GET - Aggregate infrastructure health across all projects in the workspace
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const teamId = searchParams.get('teamId');

        // 1. Fetch projects for the context
        let projects: Project[] = [];
        if (teamId) {
            projects = await listProjectsByTeam(teamId);
        } else {
            projects = await listProjectsByUser(session.user.id);
        }

        // 2. Aggregate health metrics
        let totalConnectors = 0;
        let healthyConnectors = 0;
        let degradedConnectors = 0;
        let unhealthyConnectors = 0;
        let provisioningConnectors = 0;
        let totalOptimizations = 0;
        let totalEstimatedMonthlyCost = 0;
        const optimizationBreakdown = { upgrade: 0, downgrade: 0, optimize: 0 };
        const costBreakdown = { 'cloud-sql': 0, 'memorystore': 0, 'external': 0, 'other': 0 };
        const projectHealth: Record<string, { status: string, healthy: number, total: number, optimizations: number, estimatedMonthlyCost: number }> = {};

        projects.forEach(project => {
            const configs = project.storageConfigs || [];
            let projectHealthy = 0;
            let projectOptimizations = 0;
            let projectEstimatedMonthlyCost = 0;

            configs.forEach((storage: StorageConfig) => {
                totalConnectors++;
                const health = storage.metadata?.health as { status: string } | undefined;
                const status = health?.status || (storage.status === 'provisioning' ? 'provisioning' : 'unknown');

                if (status === 'healthy') {
                    healthyConnectors++;
                    projectHealthy++;
                } else if (status === 'degraded') {
                    degradedConnectors++;
                    projectHealthy++; // Still "UP" but slow
                } else if (status === 'unhealthy' || storage.status === 'error') {
                    unhealthyConnectors++;
                } else if (status === 'provisioning') {
                    provisioningConnectors++;
                }

                // Aggregate Optimizations
                if (storage.metadata?.optimization) {
                    totalOptimizations++;
                    projectOptimizations++;
                    const optimizationData = storage.metadata.optimization as { recommendations?: Array<{ type: string }> };
                    const recommendations = optimizationData.recommendations || [];
                    recommendations.forEach((rec) => {
                        if (rec.type === 'upgrade') optimizationBreakdown.upgrade++;
                        else if (rec.type === 'downgrade') optimizationBreakdown.downgrade++;
                        else if (rec.type === 'optimize') optimizationBreakdown.optimize++;
                    });
                }

                // Aggregate Costs
                const cost = (storage.metadata?.estimatedMonthlyCost as number) || 0;
                totalEstimatedMonthlyCost += cost;
                projectEstimatedMonthlyCost += cost;

                if (storage.type.includes('cloud-sql')) costBreakdown['cloud-sql'] += cost;
                else if (storage.type === 'memorystore-redis') costBreakdown['memorystore'] += cost;
                else if (['supabase', 'mongodb-atlas', 'planetscale'].includes(storage.type)) costBreakdown['external'] += cost;
                else costBreakdown['other'] += cost;
            });

            projectHealth[project.id] = {
                status: projectHealthy === configs.length ? 'healthy' : (projectHealthy > 0 ? 'degraded' : 'unhealthy'),
                healthy: projectHealthy,
                total: configs.length,
                optimizations: projectOptimizations,
                estimatedMonthlyCost: parseFloat(projectEstimatedMonthlyCost.toFixed(2))
            };
        });

        return NextResponse.json({
            success: true,
            summary: {
                totalProjects: projects.length,
                totalConnectors,
                healthyConnectors,
                degradedConnectors,
                unhealthyConnectors,
                provisioningConnectors,
                totalOptimizations,
                optimizationBreakdown,
                totalEstimatedMonthlyCost: parseFloat(totalEstimatedMonthlyCost.toFixed(2)),
                costBreakdown: {
                    'cloud-sql': parseFloat(costBreakdown['cloud-sql'].toFixed(2)),
                    'memorystore': parseFloat(costBreakdown['memorystore'].toFixed(2)),
                    'external': parseFloat(costBreakdown['external'].toFixed(2)),
                    'other': parseFloat(costBreakdown['other'].toFixed(2))
                },
                uptimeScore: totalConnectors > 0 ? Math.round(((healthyConnectors + degradedConnectors) / totalConnectors) * 100) : 100
            },
            projectHealth
        });
    } catch (error) {
        console.error('Failed to fetch global infrastructure health:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
