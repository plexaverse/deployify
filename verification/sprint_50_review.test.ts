import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert';

// Mock Firestore
const mockSet = mock.fn();
const mockDelete = mock.fn();
const mockUpdate = mock.fn();
const mockCommit = mock.fn(() => Promise.resolve(undefined));
const mockGet = mock.fn();

const mockBatch = mock.fn(() => ({
    set: mockSet,
    delete: mockDelete,
    update: mockUpdate,
    commit: mockCommit,
}));

const mockDoc = mock.fn(() => ({
    set: mockSet,
    get: mockGet,
    delete: mockDelete,
    update: mockUpdate,
}));

const mockCollection = mock.fn(() => ({
    doc: mockDoc,
    where: mock.fn(() => ({
        limit: mock.fn(() => ({
            get: mockGet
        })),
        get: mockGet,
        orderBy: mock.fn(() => ({
             limit: mock.fn(() => ({
                 get: mockGet
             })),
             get: mockGet
        }))
    }))
}));

const mockFirestore = {
    collection: mockCollection,
    batch: mockBatch,
};

// Mock @/lib/firebase
mock.module('@/lib/firebase', {
    namedExports: {
        getDb: () => mockFirestore,
        Collections: {
            USERS: 'users',
            TEAMS: 'teams',
            TEAM_MEMBERSHIPS: 'teamMemberships',
            INVITES: 'invites',
            PROJECTS: 'projects',
            DEPLOYMENTS: 'deployments',
            ENV_VARS: 'envVars',
        }
    }
});

// Import modules under test
let createTeam: any, createInvite: any, acceptInvite: any;
let updateTraffic: any;
let getAnalyticsStats: any;

describe('Sprint 50 Final Review Verification', () => {

    before(async () => {
        const dbModule = await import('@/lib/db');
        createTeam = dbModule.createTeam;
        createInvite = dbModule.createInvite;
        acceptInvite = dbModule.acceptInvite;

        const cloudRunModule = await import('@/lib/gcp/cloudrun');
        updateTraffic = cloudRunModule.updateTraffic;

        const analyticsModule = await import('@/lib/analytics');
        getAnalyticsStats = analyticsModule.getAnalyticsStats;
    });

    describe('Team Creation and RBAC', () => {
        test('createTeam should create a team and add owner', async () => {
            const teamData = { name: 'Test Team', slug: 'test-team' };
            const ownerId = 'user-123';

            mockSet.mock.mockImplementation(() => Promise.resolve()); // Team set

            const team = await createTeam(teamData, ownerId);

            assert.strictEqual(team.name, 'Test Team');
            // Verify batch usage: createTeam calls batch() then set() twice then commit()
            assert.strictEqual(mockBatch.mock.calls.length, 1);
            assert.strictEqual(mockCommit.mock.calls.length, 1);

            // We expect 2 set calls on the batch object (team + membership)
            // But our mockBatch returns a NEW object with fresh mockSet each time?
            // No, mockBatch returns an object referencing the global mockSet.
            // So we can check mockSet calls.
            // createTeam calls batch.set() twice.
            assert.strictEqual(mockSet.mock.calls.length, 2);
        });

        test('createInvite should create an invite document', async () => {
            // Reset mocks
            mockSet.mock.resetCalls();

            const inviteData = {
                teamId: 'team-123',
                email: 'test@example.com',
                role: 'member' as const,
                inviterId: 'user-123',
                token: 'abc-123'
            };

            mockSet.mock.mockImplementation(() => Promise.resolve());

            const invite = await createInvite(
                inviteData.teamId,
                inviteData.email,
                inviteData.role,
                inviteData.inviterId,
                inviteData.token
            );

            assert.strictEqual(invite.email, 'test@example.com');
            // createInvite calls db.collection().doc().set()
            assert.strictEqual(mockSet.mock.calls.length, 1);
        });

        test('acceptInvite should create membership and delete invite', async () => {
            mockBatch.mock.resetCalls();
            mockCommit.mock.resetCalls();
            mockSet.mock.resetCalls();
            mockDelete.mock.resetCalls();

            const inviteId = 'invite-123';
            const userId = 'user-456';

            // Mock get invite
            mockGet.mock.mockImplementationOnce(() => Promise.resolve({
                exists: true,
                data: () => ({
                    teamId: 'team-123',
                    role: 'member',
                    email: 'test@example.com'
                })
            }));

            await acceptInvite(inviteId, userId);

            // Verify batch operations
            assert.strictEqual(mockBatch.mock.calls.length, 1);
            // acceptInvite: batch.set(membership), batch.delete(invite), commit()
            assert.strictEqual(mockSet.mock.calls.length, 1);
            assert.strictEqual(mockDelete.mock.calls.length, 1);
            assert.strictEqual(mockCommit.mock.calls.length, 1);
        });
    });

    describe('Rollback Functionality', () => {
        test('updateTraffic should send correct PATCH request to Cloud Run', async () => {
             // Mock fetch
            const fetchMock = mock.method(global, 'fetch', () => {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({})
                });
            });

            await updateTraffic('service-name', 'revision-1', 'access-token', 'us-central1');

            assert.strictEqual(fetchMock.mock.calls.length, 1);
            const call = fetchMock.mock.calls[0];
            const url = call.arguments[0] as string;
            const options = call.arguments[1] as RequestInit;

            assert.ok(url.includes('run.googleapis.com'));
            assert.ok(url.includes('service-name'));
            assert.strictEqual(options.method, 'PATCH');

            const body = JSON.parse(options.body as string);
            assert.deepStrictEqual(body.traffic, [{
                type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
                revision: 'revision-1',
                percent: 100
            }]);

            fetchMock.mock.restore();
        });
    });

    describe('Analytics Dashboard', () => {
         test('getAnalyticsStats should return mock data when no API key', async () => {
            // Ensure no API key in env
            const originalKey = process.env.PLAUSIBLE_API_KEY;
            delete process.env.PLAUSIBLE_API_KEY;

            const stats = await getAnalyticsStats('site-id');

            assert.ok(stats);
            assert.ok(stats.aggregate);
            assert.ok(stats.timeseries);
            assert.ok(stats.sources);
            // Mock data has specific structure we can check
            assert.strictEqual(stats.timeseries.length, 30);

            // Restore
            if (originalKey) process.env.PLAUSIBLE_API_KEY = originalKey;
        });

        test('getAnalyticsStats should call Plausible API when key exists', async () => {
             const fetchMock = mock.method(global, 'fetch', () => {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ results: [] })
                });
            });

            const stats = await getAnalyticsStats('site-id', '30d', 'fake-key');

            assert.strictEqual(fetchMock.mock.calls.length, 3); // aggregate, timeseries, sources
            const url = fetchMock.mock.calls[0].arguments[0] as string;
            assert.ok(url.includes('plausible.io/api/v1'));

            fetchMock.mock.restore();
        });
    });
});
