import { test, mock, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Mock Config
mock.module('@/lib/config', {
    namedExports: {
        config: {
            gcp: {
                projectId: 'test-project',
                region: 'us-central1',
            },
            firebase: {
                projectId: 'test-project',
                clientEmail: 'test@example.com',
                privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ...\n-----END PRIVATE KEY-----\n',
            }
        }
    }
});

// Mock Firestore Structures
const mockDoc = {
    set: mock.fn(),
    get: mock.fn(),
    update: mock.fn(),
    delete: mock.fn(),
    data: mock.fn(),
    exists: true,
    id: 'mock-doc-id',
    ref: { path: 'mock/path' }
};

// We need a way to return different docs based on calls if needed,
// but for these simple tests, a shared mockDoc often suffices if we reset calls.
// However, for batch operations involving multiple sets, we might want to differentiate.
// For now, let's just assume simple structure.

const mockCollection = {
    doc: mock.fn(() => mockDoc),
    where: mock.fn(() => mockCollection),
    limit: mock.fn(() => mockCollection),
    get: mock.fn(() => ({ empty: false, docs: [mockDoc] })),
    add: mock.fn(),
    orderBy: mock.fn(() => mockCollection),
};

const mockBatch = {
    set: mock.fn(),
    update: mock.fn(),
    delete: mock.fn(),
    commit: mock.fn(),
};

const mockDb = {
    collection: mock.fn(() => mockCollection),
    batch: mock.fn(() => mockBatch),
    getAll: mock.fn(() => []),
};

// Mock Firebase module
mock.module('@/lib/firebase', {
    namedExports: {
        getDb: () => mockDb,
        Collections: {
            TEAMS: 'teams',
            TEAM_MEMBERSHIPS: 'teamMemberships',
            INVITES: 'invites',
            USERS: 'users',
            PROJECTS: 'projects',
            DEPLOYMENTS: 'deployments',
            ENV_VARS: 'envVars',
        }
    }
});

// Import modules under test
// Note: We MUST use dynamic import because static imports are evaluated before mock.module runs
let createTeam: any, createInvite: any, acceptInvite: any;
let updateTraffic: any;

describe('Sprint 50 Review Verification', () => {

    beforeEach(async () => {
        const dbModule = await import('@/lib/db');
        createTeam = dbModule.createTeam;
        createInvite = dbModule.createInvite;
        acceptInvite = dbModule.acceptInvite;

        const cloudrunModule = await import('@/lib/gcp/cloudrun');
        updateTraffic = cloudrunModule.updateTraffic;
    });

    describe('Team Creation & RBAC', () => {
        beforeEach(() => {
            // Reset mocks
            mockDb.collection.mock.resetCalls();
            mockBatch.set.mock.resetCalls();
            mockBatch.delete.mock.resetCalls();
            mockBatch.commit.mock.resetCalls();
            mockDoc.set.mock.resetCalls();
            mockDoc.get.mock.resetCalls();
            mockDoc.data.mock.resetCalls();
            mockCollection.doc.mock.resetCalls();
        });

        test('createTeam should create team and owner membership', async () => {
            const teamData = { name: 'Test Team', slug: 'test-team' };
            const ownerId = 'owner-123';

            await createTeam(teamData, ownerId);

            // Verify batch operations
            assert.strictEqual(mockBatch.set.mock.callCount(), 2, 'Should perform 2 sets (Team + Membership)');
            assert.strictEqual(mockBatch.commit.mock.callCount(), 1, 'Should commit batch');

            // Check if team was created
            // calls are [ [arg0, arg1], ... ]
            // call arguments are [docRef, data]

            // We can't guarantee order easily without checking args, but usually it follows code order
            const teamPayload = mockBatch.set.mock.calls[0].arguments[1];
            assert.strictEqual(teamPayload.name, 'Test Team');
            assert.strictEqual(teamPayload.slug, 'test-team');

            // Check if membership was created
            const membershipPayload = mockBatch.set.mock.calls[1].arguments[1];
            assert.strictEqual(membershipPayload.userId, ownerId);
            assert.strictEqual(membershipPayload.role, 'owner');
        });

        test('createInvite should store invitation', async () => {
            const teamId = 'team-123';
            const email = 'test@example.com';
            const role = 'member';
            const inviterId = 'owner-123';
            const token = 'abc-123';

            await createInvite(teamId, email, role, inviterId, token);

            assert.strictEqual(mockDoc.set.mock.callCount(), 1);
            const payload = mockDoc.set.mock.calls[0].arguments[0];
            assert.strictEqual(payload.teamId, teamId);
            assert.strictEqual(payload.email, email);
            assert.strictEqual(payload.role, role);
            assert.strictEqual(payload.token, token);
        });

        test('acceptInvite should create membership and delete invite', async () => {
             const inviteId = 'invite-123';
             const userId = 'user-456';
             const inviteData = {
                 teamId: 'team-123',
                 role: 'viewer',
                 email: 'user@example.com'
             };

             // Mock retrieving the invite
             mockDoc.exists = true;
             mockDoc.data.mock.mockImplementation(() => inviteData);
             mockDoc.get.mock.mockImplementation(async () => mockDoc); // .get returns the docSnapshot (which we simplify to act like the doc itself for .exists and .data())

             // In reality: doc.get() returns a DocumentSnapshot.
             // db.collection().doc() returns a DocumentReference.

             // Correcting mock structure for acceptInvite flow:
             // 1. inviteRef = db.collection().doc(inviteId) -> returns MockDocRef
             // 2. inviteDoc = await inviteRef.get() -> returns MockDocSnapshot

             // My mockCollection.doc() returns mockDoc (Ref).
             // mockDoc.get() returns object with exists/data().

             // Let's ensure mockDoc.get() returns something with exists and data()
             mockDoc.get.mock.mockImplementation(async () => ({
                 exists: true,
                 data: () => inviteData
             }));

             await acceptInvite(inviteId, userId);

             // Verify get invite
             assert.strictEqual(mockDoc.get.mock.callCount(), 1, 'Should fetch invite');

             // Verify batch operations
             assert.strictEqual(mockBatch.set.mock.callCount(), 1, 'Should create membership');
             assert.strictEqual(mockBatch.delete.mock.callCount(), 1, 'Should delete invite');
             assert.strictEqual(mockBatch.commit.mock.callCount(), 1, 'Should commit batch');

             // Check membership creation
             const membershipPayload = mockBatch.set.mock.calls[0].arguments[1];
             assert.strictEqual(membershipPayload.teamId, inviteData.teamId);
             assert.strictEqual(membershipPayload.userId, userId);
             assert.strictEqual(membershipPayload.role, inviteData.role);
        });
    });

    describe('Rollback Functionality', () => {
        let originalFetch: any;

        beforeEach(() => {
            originalFetch = global.fetch;
            global.fetch = mock.fn();
        });

        afterEach(() => {
            global.fetch = originalFetch;
        });

        test('updateTraffic sends correct patch request', async () => {
            const serviceName = 'my-service';
            const revisionName = 'my-service-v1';
            const accessToken = 'fake-token';

            (global.fetch as any).mock.mockImplementation(async () => ({ ok: true }));

            await updateTraffic(serviceName, revisionName, accessToken);

            assert.strictEqual((global.fetch as any).mock.callCount(), 1);
            const [url, options] = (global.fetch as any).mock.calls[0].arguments;

            assert.ok(url.includes(serviceName), 'URL should include service name');
            assert.strictEqual(options.method, 'PATCH');

            const body = JSON.parse(options.body);
            assert.strictEqual(body.traffic.length, 1);
            assert.strictEqual(body.traffic[0].type, 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION');
            assert.strictEqual(body.traffic[0].revision, revisionName);
            assert.strictEqual(body.traffic[0].percent, 100);
        });
    });
});
