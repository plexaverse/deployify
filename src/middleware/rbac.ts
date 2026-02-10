import { getProjectById, getTeamMembership } from '@/lib/db';
import type { Project, TeamMembership } from '@/types';

export type ProjectAccessResult =
    | { allowed: true; project: Project; membership?: TeamMembership }
    | { allowed: false; error: string; status: number };

export async function checkProjectAccess(userId: string, projectId: string): Promise<ProjectAccessResult> {
    try {
        const project = await getProjectById(projectId);

        if (!project) {
            return { allowed: false, error: 'Project not found', status: 404 };
        }

        if (project.teamId) {
            // Check team membership
            const membership = await getTeamMembership(project.teamId, userId);
            if (membership) {
                return { allowed: true, project, membership };
            }
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
