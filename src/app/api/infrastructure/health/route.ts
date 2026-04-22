import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listProjectsByUser, listProjectsByTeam } from '@/lib/db';
import { getEstimatedMonthlyCost, getExternalMetrics } from '@/lib/gcp/monitoring';
import type { Project } from '@/types';

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
        let totalEfficiencyScore = 0;
        let connectorsWithScore = 0;
        let connectorsWithEfficiency = 0;
        let totalRisks = 0;
        const riskBreakdown = { critical: 0, high: 0, medium: 0, low: 0 };
        const costBreakdown: Record<string, number> = {};
        const optimizationBreakdown = { upgrade: 0, downgrade: 0, optimize: 0 };
        const regionalMappings: Array<{
            projectId: string;
            projectName: string;
            projectRegion: string;
            storageId: string;
            storageName: string;
            storageRegion: string;
            storageType: string;
            latencyMs: number;
            aligned: boolean;
        }> = [];
        const projectHealth: Record<string, { status: string, healthy: number, total: number, optimizations: number, estimatedMonthlyCost: number, securityScore: number, totalRisks: number }> = {};

        const projectResults = await Promise.all(projects.map(async (project) => {
            const configs = project.storageConfigs || [];
            let projectHealthy = 0;
            let projectOptimizations = 0;
            let projectCost = 0;
            let projectSecurityScore = 0;
            let projectConnectorsWithScore = 0;
            let projectRisks = 0;

            const storageResults = await Promise.all(configs.map(async (storage) => {
                const health = storage.metadata?.health as { status: string } | undefined;
                let status = health?.status || (storage.status === 'provisioning' ? 'provisioning' : 'unknown');

                // For external connectors, if status is unknown/active, try to fetch real status
                if (status === 'active' || status === 'unknown') {
                    if (['supabase', 'mongodb-atlas', 'neon'].includes(storage.type)) {
                        const ext = await getExternalMetrics(storage.type, storage.metadata || {});
                        if (ext.status && ext.status !== 'UNKNOWN') {
                            status = ext.status.toLowerCase();
                        }
                    }
                }

                // Temporary object to hold metrics for this storage
                return {
                    status,
                    type: storage.type,
                    metadata: storage.metadata,
                    id: storage.id,
                    provisioned: storage.status === 'provisioning'
                };
            }));

            // Now aggregate the results synchronously
            storageResults.forEach((result) => {
                totalConnectors++;
                const status = result.status;

                if (status === 'healthy') {
                    healthyConnectors++;
                    projectHealthy++;
                } else if (status === 'degraded') {
                    degradedConnectors++;
                    projectHealthy++;
                } else if (status === 'unhealthy' || result.provisioned === false) { // storage.status === 'error' handled by result mapping if needed
                    unhealthyConnectors++;
                } else if (status === 'provisioning') {
                    provisioningConnectors++;
                }

                // Aggregate Optimizations
                if (result.metadata?.optimization) {
                    totalOptimizations++;
                    projectOptimizations++;
                    const optimizationData = result.metadata.optimization as { recommendations?: Array<{ type: string, savingsAmount?: number }> };
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

                // Aggregate Efficiency Score
                if (result.metadata?.efficiencyScore !== undefined) {
                    totalEfficiencyScore += result.metadata.efficiencyScore as number;
                    connectorsWithEfficiency++;
                }

                // Aggregate Cost Intelligence
                const tier = (result.metadata?.tier as string) || (result.type.includes('cloud-sql') ? 'db-f1-micro' : (result.type === 'memorystore-redis' ? '1GB' : ''));
                const diskSizeGb = (result.metadata?.diskSizeGb as number) || (result.metadata?.memorySizeGb as number);
                const isHA = !!result.metadata?.highAvailability;

                const estimatedCost = getEstimatedMonthlyCost(result.type, tier, diskSizeGb, isHA);
                totalEstimatedMonthlyCost += estimatedCost;
                projectCost += estimatedCost;
                costBreakdown[result.type] = (costBreakdown[result.type] || 0) + estimatedCost;

                // Aggregate Security Posture
                if (result.metadata?.security) {
                    const security = result.metadata.security as { score: number, risks: Array<{ level: string }> };
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

                // Aggregate Regional Mapping
                const pRegion = project.region || 'us-central1';
                const sRegion = (result.metadata?.region as string) || pRegion;
                const aligned = pRegion === sRegion;

                regionalMappings.push({
                    projectId: project.id,
                    projectName: project.name,
                    projectRegion: pRegion,
                    storageId: result.id,
                    storageName: (result.metadata?.name as string) || result.id,
                    storageRegion: sRegion,
                    storageType: result.type,
                    latencyMs: aligned ? 5 : 45, // Simulation: Intra-region vs Cross-region
                    aligned
                });
            });

            return {
                id: project.id,
                data: {
                    status: projectHealthy === configs.length ? 'healthy' : (projectHealthy > 0 ? 'degraded' : 'unhealthy'),
                    healthy: projectHealthy,
                    total: configs.length,
                    optimizations: projectOptimizations,
                    estimatedMonthlyCost: parseFloat(projectCost.toFixed(2)),
                    securityScore: projectConnectorsWithScore > 0 ? Math.round(projectSecurityScore / projectConnectorsWithScore) : 100,
                    totalRisks: projectRisks
                }
            };
        }));

        projectResults.forEach(res => {
            projectHealth[res.id] = res.data;
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
                averageEfficiencyScore: connectorsWithEfficiency > 0 ? Math.round(totalEfficiencyScore / connectorsWithEfficiency) : 100,
                uptimeScore: totalConnectors > 0 ? Math.round(((healthyConnectors + degradedConnectors) / totalConnectors) * 100) : 100
            },
            projectHealth,
            regionalMappings
        });
    } catch (error) {
        console.error('Failed to fetch global infrastructure health:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
