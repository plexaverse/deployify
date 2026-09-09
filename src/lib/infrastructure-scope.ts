import { listProjectsByUser, listProjectsByTeam, getTeamMembership } from '@/lib/db';
import type { Project, TeamRole } from '@/types';

export type TeamScopeMode = 'enforce' | 'report';

/**
 * Kill-switch for team-scope enforcement on workspace-wide infrastructure routes.
 * Defaults to 'enforce'. Set INFRA_TEAM_SCOPE_ENFORCEMENT=report to fall back to
 * the pre-fix behaviour (serve the data, log the would-be denial) without a code rollback.
 */
export function getTeamScopeMode(): TeamScopeMode {
    return process.env.INFRA_TEAM_SCOPE_ENFORCEMENT === 'report' ? 'report' : 'enforce';
}

/**
 * Mirrors the sentinel handling already used by GET /api/projects so that the
 * workspace routes treat '?teamId=null' / '?teamId=undefined' as "no team".
 */
export function normalizeTeamId(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }
    const teamId = raw.trim();
    if (!teamId || teamId === 'null' || teamId === 'undefined') {
        return null;
    }
    return teamId;
}

export type WorkspaceScopeResult =
    | { allowed: true; projects: Project[]; teamId: string | null; role: TeamRole | null }
    | { allowed: false; error: string; status: number };

/**
 * Resolve the set of projects a workspace-wide report may aggregate over.
 * When a teamId is supplied it is verified against TEAM_MEMBERSHIPS first --
 * the same check GET /api/projects and POST /api/infrastructure/remediate already perform.
 */
export async function resolveWorkspaceProjects(
    userId: string,
    rawTeamId: string | null | undefined,
    route: string
): Promise<WorkspaceScopeResult> {
    const teamId = normalizeTeamId(rawTeamId);

    if (!teamId) {
        return { allowed: true, projects: await listProjectsByUser(userId), teamId: null, role: null };
    }

    const membership = await getTeamMembership(teamId, userId);

    if (!membership) {
        if (getTeamScopeMode() === 'report') {
            console.warn(`[team-scope] would-deny ${route} user=${userId} teamId=${teamId} (INFRA_TEAM_SCOPE_ENFORCEMENT=report)`);
            return { allowed: true, projects: await listProjectsByTeam(teamId), teamId, role: null };
        }
        console.warn(`[team-scope] denied ${route} user=${userId} teamId=${teamId}`);
        return { allowed: false, error: 'Unauthorized access to team', status: 403 };
    }

    return { allowed: true, projects: await listProjectsByTeam(teamId), teamId, role: membership.role };
}
