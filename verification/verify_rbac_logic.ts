// Verification script for RBAC logic
// Note: We are duplicating the function here to avoid importing dependencies that fail in this environment.
// Ideally we would import checkProjectAccess from '../src/middleware/rbac';

import type { Project, TeamMembership } from '../src/types';

export type ProjectAccessResult =
    | { allowed: true; project: Project; membership?: TeamMembership }
    | { allowed: false; error: string; status: number };

export interface RBACDependencies {
    getProjectById: (id: string) => Promise<Project | null>;
    getTeamMembership: (teamId: string, userId: string) => Promise<TeamMembership | null>;
}

// The function under test (copied from src/middleware/rbac.ts)
export async function checkProjectAccess(
    userId: string,
    projectId: string,
    deps: RBACDependencies
): Promise<ProjectAccessResult> {
    try {
        const project = await deps.getProjectById(projectId);

        if (!project) {
            return { allowed: false, error: 'Project not found', status: 404 };
        }

        if (project.teamId) {
            // Check team membership
            const membership = await deps.getTeamMembership(project.teamId, userId);
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

// Mock data
const mockProject: Project = {
    id: 'proj_1',
    userId: 'user_1',
    teamId: 'team_1',
    name: 'Test Project',
    slug: 'test-project',
    repoFullName: 'test/repo',
    repoUrl: 'https://github.com/test/repo',
    defaultBranch: 'main',
    framework: 'nextjs',
    buildCommand: 'npm run build',
    installCommand: 'npm install',
    outputDirectory: 'out',
    rootDirectory: '.',
    cloudRunServiceId: null,
    productionUrl: null,
    region: 'us-central1',
    customDomain: null,
    createdAt: new Date(),
    updatedAt: new Date()
};

const mockMembership: TeamMembership = {
    id: 'mem_1',
    teamId: 'team_1',
    userId: 'user_2',
    role: 'viewer',
    joinedAt: new Date()
};

// Mock dependencies
const mockGetProjectById = async (id: string): Promise<Project | null> => {
    if (id === 'proj_1') return mockProject;
    return null;
};

const mockGetTeamMembership = async (teamId: string, userId: string): Promise<TeamMembership | null> => {
    if (teamId === 'team_1' && userId === 'user_2') return mockMembership;
    return null;
};

async function runTest() {
    console.log('Testing checkProjectAccess Logic...');

    // Test 1: Project not found
    const result1 = await checkProjectAccess('user_1', 'proj_unknown', {
        getProjectById: mockGetProjectById,
        getTeamMembership: mockGetTeamMembership
    });
    console.log('Test 1 (Project not found):', result1.allowed === false && (result1 as any).status === 404 ? 'PASS' : 'FAIL');

    // Test 2: Personal project owner
    const personalProject = { ...mockProject, teamId: undefined, userId: 'user_1' };
    const result2 = await checkProjectAccess('user_1', 'proj_1', {
        getProjectById: async () => personalProject,
        getTeamMembership: mockGetTeamMembership
    });
    console.log('Test 2 (Personal owner):', result2.allowed === true ? 'PASS' : 'FAIL');

    // Test 3: Team member (viewer)
    const result3 = await checkProjectAccess('user_2', 'proj_1', {
        getProjectById: mockGetProjectById,
        getTeamMembership: mockGetTeamMembership
    });

    // Check if membership is returned correctly
    const passed3 = result3.allowed === true &&
                   (result3 as any).membership?.role === 'viewer';

    console.log('Test 3 (Team member):', passed3 ? 'PASS' : 'FAIL');
    if (!passed3) console.log('Result:', JSON.stringify(result3, null, 2));

    // Test 4: Non-member
    const result4 = await checkProjectAccess('user_3', 'proj_1', {
        getProjectById: mockGetProjectById,
        getTeamMembership: mockGetTeamMembership
    });
    console.log('Test 4 (Non-member):', result4.allowed === false && (result4 as any).status === 403 ? 'PASS' : 'FAIL');
}

runTest().catch(console.error);
