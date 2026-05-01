import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listProjectsByUser, listProjectsByTeam } from '@/lib/db';
import { checkSecurityPosture } from '@/lib/gcp/security-auditor';
import type { Project } from '@/types';

/**
 * GET - Detailed workspace-wide compliance report for all projects and databases
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const teamId = searchParams.get('teamId');

        // 1. Fetch projects
        let projects: Project[] = [];
        if (teamId) {
            projects = await listProjectsByTeam(teamId);
        } else {
            projects = await listProjectsByUser(session.user.id);
        }

        // 2. Generate detailed compliance data
        const report = projects.map(project => {
            const configs = project.storageConfigs || [];
            const complianceItems = configs.map(storage => {
                // In a real environment, we'd fetch actual IAM state here.
                // For the report, we'll use metadata if available or a default least-privilege check.
                const iamPosture = storage.metadata?.iamOverprivileged !== undefined ? {
                    overprivileged: !!storage.metadata.iamOverprivileged,
                    excessiveRoles: (storage.metadata.excessiveRoles as string[]) || []
                } : undefined;

                const posture = checkSecurityPosture(storage, project.region, iamPosture);
                return {
                    connectorId: storage.id,
                    connectorName: storage.name,
                    type: storage.type,
                    environment: storage.environment,
                    score: posture.score,
                    grade: posture.grade,
                    risks: posture.risks,
                    lastAuditedAt: posture.lastAuditedAt,
                    status: posture.score === 100 ? 'COMPLIANT' : (posture.score >= 80 ? 'PARTIAL' : 'NON_COMPLIANT')
                };
            });

            const avgScore = complianceItems.length > 0
                ? Math.round(complianceItems.reduce((acc, item) => acc + item.score, 0) / complianceItems.length)
                : 100;

            return {
                projectId: project.id,
                projectName: project.name,
                avgScore,
                totalRisks: complianceItems.reduce((acc, item) => acc + item.risks.length, 0),
                connectors: complianceItems
            };
        });

        const totalConnectors = report.reduce((acc, p) => acc + p.connectors.length, 0);
        const averageWorkspaceScore = report.length > 0
            ? Math.round(report.reduce((acc, p) => acc + p.avgScore, 0) / report.length)
            : 100;

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            summary: {
                totalProjects: projects.length,
                totalConnectors,
                averageWorkspaceScore,
                totalRisks: report.reduce((acc, p) => acc + p.totalRisks, 0),
            },
            report
        });
    } catch (error) {
        console.error('Failed to generate compliance report:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
