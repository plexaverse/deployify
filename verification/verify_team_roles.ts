
import { listTeamsWithMembership } from '../src/lib/db';
import { Collections } from '../src/lib/firebase';
import type { TeamWithRole, TeamMembership, Team } from '../src/types';

// Mock DB implementation
const mockDb = {
    collection: (name: string) => {
        return {
            doc: (id: string) => ({ id }), // Mock document reference
            where: (field: string, op: string, value: string) => {
                // Collections.TEAM_MEMBERSHIPS is 'teamMemberships'
                if (name === 'teamMemberships' && field === 'userId' && value === 'user1') {
                    return {
                        get: async () => ({
                            empty: false,
                            docs: [
                                {
                                    data: () => ({
                                        id: 'mem1',
                                        teamId: 'team1',
                                        userId: 'user1',
                                        role: 'owner',
                                        joinedAt: { toDate: () => new Date('2023-01-01') }
                                    } as any)
                                }
                            ]
                        })
                    };
                }
                return { get: async () => ({ empty: true, docs: [] }) };
            }
        };
    },
    getAll: async (...refs: any[]) => {
        // Mock returning team docs corresponding to refs
        return refs.map(ref => {
            if (ref.id === 'team1') {
                return {
                    exists: true,
                    data: () => ({
                        id: 'team1',
                        name: 'Test Team',
                        slug: 'test-team',
                        createdAt: { toDate: () => new Date('2023-01-01') },
                        updatedAt: { toDate: () => new Date('2023-01-01') }
                    } as any)
                };
            }
            return { exists: false };
        });
    }
};

async function runTest() {
    console.log('Running verify_team_roles test...');

    try {
        const teams = await listTeamsWithMembership('user1', mockDb);

        console.log(`Found ${teams.length} teams.`);

        if (teams.length !== 1) {
            console.error('FAILED: Expected 1 team, got ' + teams.length);
            process.exit(1);
        }

        const team = teams[0];
        console.log('Team:', team.name);
        console.log('Role:', team.membership?.role);

        if (team.membership?.role !== 'owner') {
            console.error('FAILED: Expected role owner, got ' + team.membership?.role);
            process.exit(1);
        }

        console.log('SUCCESS: verify_team_roles passed!');

    } catch (error) {
        console.error('Test failed with error:', error);
        process.exit(1);
    }
}

runTest();
