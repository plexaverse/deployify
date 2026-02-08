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
};

const mockCollection = {
    doc: mock.fn(() => mockDoc),
    where: mock.fn(() => mockCollection),
    limit: mock.fn(() => mockCollection),
    orderBy: mock.fn(() => mockCollection),
    get: mock.fn(() => ({ empty: false, docs: [mockDoc] })),
    add: mock.fn(),
};

const mockDb = {
    collection: mock.fn(() => mockCollection),
};

// Mock Firebase module
mock.module('@/lib/firebase', {
    namedExports: {
        getDb: () => mockDb,
        Collections: {
            AUDIT_LOGS: 'auditLogs',
        }
    }
});

// Import modules under test
let logAuditEvent: any, listAuditLogs: any;

describe('Audit Logs Verification', () => {

    beforeEach(async () => {
        const auditModule = await import('@/lib/audit');
        logAuditEvent = auditModule.logAuditEvent;
        listAuditLogs = auditModule.listAuditLogs;

        // Reset mocks
        mockDb.collection.mock.resetCalls();
        mockCollection.doc.mock.resetCalls();
        mockDoc.set.mock.resetCalls();
        mockCollection.where.mock.resetCalls();
        mockCollection.orderBy.mock.resetCalls();
        mockCollection.limit.mock.resetCalls();
        mockCollection.get.mock.resetCalls();
    });

    test('logAuditEvent should create an audit log entry', async () => {
        const teamId = 'team-123';
        const userId = 'user-456';
        const action = 'Test Action';
        const details = { foo: 'bar' };

        await logAuditEvent(teamId, userId, action, details);

        // Verify collection access
        assert.strictEqual(mockDb.collection.mock.callCount(), 1);
        assert.strictEqual(mockDb.collection.mock.calls[0].arguments[0], 'auditLogs');

        // Verify doc creation
        assert.strictEqual(mockCollection.doc.mock.callCount(), 1);

        // Verify set call
        assert.strictEqual(mockDoc.set.mock.callCount(), 1);
        const event = mockDoc.set.mock.calls[0].arguments[0];

        assert.strictEqual(event.teamId, teamId);
        assert.strictEqual(event.userId, userId);
        assert.strictEqual(event.action, action);
        assert.deepStrictEqual(event.details, details);
        assert.ok(event.createdAt instanceof Date);
        assert.ok(event.id);
    });

    test('listAuditLogs should query audit logs correctly', async () => {
        const teamId = 'team-123';
        const limit = 10;

        // Setup mock return
        const mockLogData = {
            id: 'log-1',
            teamId,
            userId: 'user-1',
            action: 'Action',
            details: {},
            createdAt: { toDate: () => new Date() } // Simulate Firestore Timestamp
        };
        mockDoc.data.mock.mockImplementation(() => mockLogData);

        await listAuditLogs(teamId, limit);

        // Verify collection access
        assert.strictEqual(mockDb.collection.mock.callCount(), 1);
        assert.strictEqual(mockDb.collection.mock.calls[0].arguments[0], 'auditLogs');

        // Verify query chain
        // Note: checking call order or arguments
        // where('teamId', '==', teamId)
        assert.ok(mockCollection.where.mock.calls.length >= 1);
        const whereArgs = mockCollection.where.mock.calls[0].arguments;
        assert.strictEqual(whereArgs[0], 'teamId');
        assert.strictEqual(whereArgs[1], '==');
        assert.strictEqual(whereArgs[2], teamId);

        // orderBy('createdAt', 'desc')
        assert.ok(mockCollection.orderBy.mock.calls.length >= 1);
        const orderByArgs = mockCollection.orderBy.mock.calls[0].arguments;
        assert.strictEqual(orderByArgs[0], 'createdAt');
        assert.strictEqual(orderByArgs[1], 'desc');

        // limit(limit)
        assert.ok(mockCollection.limit.mock.calls.length >= 1);
        const limitArgs = mockCollection.limit.mock.calls[0].arguments;
        assert.strictEqual(limitArgs[0], limit);

        // get()
        assert.strictEqual(mockCollection.get.mock.callCount(), 1);
    });
});
