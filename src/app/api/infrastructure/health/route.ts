import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listProjectsByUser, listProjectsByTeam } from '@/lib/db';
import { getEstimatedMonthlyCost } from '@/lib/gcp/monitoring';
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
        let totalPotentialSavings = 0;
        let totalSecurityScore = 0;
        let connectorsWithScore = 0;
        let totalRisks = 0;
        const riskBreakdown = { critical: 0, high: 0, medium: 0, low: 0 };
        const costBreakdown: Record<string, number> = {};
        const optimizationBreakdown = { upgrade: 0, downgrade: 0, optimize: 0 };
        const projectHealth: Record<string, { status: string, healthy: number, total: number, optimizations: number, estimatedMonthlyCost: number, securityScore: number, totalRisks: number }> = {};

        projects.forEach(project => {
            const configs = project.storageConfigs || [];
            let projectHealthy = 0;
            let projectOptimizations = 0;
            let projectCost = 0;
            let projectSecurityScore = 0;
            let projectConnectorsWithScore = 0;
            let projectRisks = 0;

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
                    const optimizationData = storage.metadata.optimization as { recommendations?: Array<{ type: string, savingsAmount?: number }> };
                    const recommendations = optimizationData.recommendations || [];
                    recommendations.forEach((rec) => {
                        if (rec.type === 'upgrade') optimizationBreakdown.upgrade++;
                        else if (rec.type === 'downgrade') {
                            optimizationBreakdown.downgrade++;
                            if (rec.savingsAmount) {
                                totalPotentialSavings += rec.savingsAmount;
                            }
                        }
                        else if (rec.type === 'optimize') optimizationBreakdown.optimize++;
                    });
                }

                // Aggregate Cost Intelligence
                const tier = (storage.metadata?.tier as string) || (storage.type.includes('cloud-sql') ? 'db-f1-micro' : (storage.type === 'memorystore-redis' ? '1GB' : ''));
                const diskSizeGb = (storage.metadata?.diskSizeGb as number) || (storage.metadata?.memorySizeGb as number);
                const isHA = !!storage.metadata?.highAvailability;

                const estimatedCost = getEstimatedMonthlyCost(storage.type, tier, diskSizeGb, isHA);
                totalEstimatedMonthlyCost += estimatedCost;
                projectCost += estimatedCost;
                costBreakdown[storage.type] = (costBreakdown[storage.type] || 0) + estimatedCost;

                // Aggregate Security Posture
                if (storage.metadata?.security) {
                    const security = storage.metadata.security as { score: number, risks: Array<{ level: string }> };
                    totalSecurityScore += security.score;
                    connectorsWithScore++;
                    projectSecurityScore += security.score;
                    projectConnectorsWithScore++;
                    totalRisks += security.risks.length;
                    projectRisks += security.risks.length;

                    security.risks.forEach(risk => {
                        if (risk.level === 'critical') riskBreakdown.critical++;
                        else if (risk.level === 'high') riskBreakdown.high++;
                        else if (risk.level === 'medium') riskBreakdown.medium++;
                        else if (risk.level === 'low') riskBreakdown.low++;
                    });
                }
            });

            projectHealth[project.id] = {
                status: projectHealthy === configs.length ? 'healthy' : (projectHealthy > 0 ? 'degraded' : 'unhealthy'),
                healthy: projectHealthy,
                total: configs.length,
                optimizations: projectOptimizations,
                estimatedMonthlyCost: parseFloat(projectCost.toFixed(2)),
                securityScore: projectConnectorsWithScore > 0 ? Math.round(projectSecurityScore / projectConnectorsWithScore) : 100,
                totalRisks: projectRisks
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
                totalPotentialSavings: parseFloat(totalPotentialSavings.toFixed(2)),
                costBreakdown,
                totalRisks,
                riskBreakdown,
                averageSecurityScore: connectorsWithScore > 0 ? Math.round(totalSecurityScore / connectorsWithScore) : 100,
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
