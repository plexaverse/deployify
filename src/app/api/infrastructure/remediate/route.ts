import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listProjectsByUser, listProjectsByTeam, getTeamMembership } from '@/lib/db';
import { remediateRisk } from '@/lib/gcp/remediation-utils';
import type { Project } from '@/types';

/**
 * POST - Bulk remediation for workspace-wide risks
 * Accepts a list of risks to remediate across multiple projects/connectors
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { teamId, risks } = await request.json();

        if (!risks || !Array.isArray(risks) || risks.length === 0) {
            return NextResponse.json({ success: false, error: 'Missing or invalid risks array' }, { status: 400 });
        }

        // 1. Fetch projects
        let projects: Project[] = [];
        if (teamId) {
            // Security: Verify user is a member of the team
            const membership = await getTeamMembership(teamId, session.user.id);
            if (!membership) {
                return NextResponse.json({ success: false, error: 'Team access denied' }, { status: 403 });
            }
            projects = await listProjectsByTeam(teamId);
        } else {
            projects = await listProjectsByUser(session.user.id);
        }

        const results = [];
        const projectMap = new Map(projects.map(p => [p.id, p]));

        // 2. Process each risk
        for (const risk of risks) {
            const { projectId, storageId, riskId } = risk;

            if (!projectId || !storageId || !riskId) {
                results.push({
                    projectId,
                    storageId,
                    riskId,
                    success: false,
                    error: 'Missing required risk parameters'
                });
                continue;
            }

            const project = projectMap.get(projectId);
            if (!project) {
                results.push({
                    projectId,
                    storageId,
                    riskId,
                    success: false,
                    error: 'Project not found or access denied'
                });
                continue;
            }

            // Remediate the risk
            const remediationResult = await remediateRisk(projectId, storageId, riskId, project);

            results.push({
                projectId,
                storageId,
                riskId,
                success: remediationResult.success,
                message: remediationResult.message,
                error: remediationResult.error
            });
        }

        const successCount = results.filter(r => r.success).length;

        return NextResponse.json({
            success: true,
            results,
            summary: {
                total: risks.length,
                successful: successCount,
                failed: risks.length - successCount
            }
        });

    } catch (error) {
        console.error('Bulk remediation API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error during bulk remediation'
        }, { status: 500 });
    }
}
