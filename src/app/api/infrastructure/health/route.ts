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
        const projectHealth: Record<string, { status: string, healthy: number, total: number }> = {};

        projects.forEach(project => {
            const configs = project.storageConfigs || [];
            let projectHealthy = 0;

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
            });

            projectHealth[project.id] = {
                status: projectHealthy === configs.length ? 'healthy' : (projectHealthy > 0 ? 'degraded' : 'unhealthy'),
                healthy: projectHealthy,
                total: configs.length
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
