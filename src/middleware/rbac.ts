import { getProjectById, getTeamMembership } from '@/lib/db';
import type { Project, TeamRole } from '@/types';

export type ProjectAccessResult =
    | { allowed: true; project: Project }
    | { allowed: false; error: string; status: number };

const ROLE_HIERARCHY: Record<TeamRole, number> = {
    'owner': 4,
    'admin': 3,
    'member': 2,
    'viewer': 1,
};

function hasRole(userRole: TeamRole, requiredRole: TeamRole): boolean {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export interface CheckProjectAccessOptions {
    minRole?: TeamRole;
}

export async function checkProjectAccess(
    userId: string,
    projectId: string,
    options: CheckProjectAccessOptions = {}
): Promise<ProjectAccessResult> {
    try {
        const project = await getProjectById(projectId);

        if (!project) {
            return { allowed: false, error: 'Project not found', status: 404 };
        }

        if (project.teamId) {
            // Check team membership
            const membership = await getTeamMembership(project.teamId, userId);
            if (!membership) {
                 return { allowed: false, error: 'Forbidden: You are not a member of this team', status: 403 };
            }

            if (options.minRole) {
                if (!hasRole(membership.role, options.minRole)) {
                    return {
                        allowed: false,
                        error: `Forbidden: Requires ${options.minRole} role or higher`,
                        status: 403
                    };
                }
            }

            return { allowed: true, project };
        } else {
            // Check personal ownership
            if (project.userId === userId) {
                return { allowed: true, project };
            }
        }

        return { allowed: false, error: 'Forbidden', status: 403 };
    } catch (error) {
        console.error('Error checking project access:', error);
        return { allowed: false, error: 'Internal Server Error', status: 500 };
    }
}
