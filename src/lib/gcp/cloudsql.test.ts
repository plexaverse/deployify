
import assert from 'node:assert';
import { test, describe } from 'node:test';
import { listBackups, createBackup, restoreBackup, createDatabase, deleteDatabase } from './cloudsql';

describe('Cloud SQL Database Operations (Mock)', () => {
    process.env.MOCK_DB = 'true';

    test('createDatabase returns mock operation', async () => {
        const op = await createDatabase('test-instance', 'test-db');
        assert.strictEqual(op, 'projects/mock/operations/db-test-db');
    });

    test('deleteDatabase returns mock operation', async () => {
        const op = await deleteDatabase('test-instance', 'test-db');
        assert.strictEqual(op, 'projects/mock/operations/delete-db-test-db');
    });
});

describe('Cloud SQL Backup Management (Mock)', () => {
    process.env.MOCK_DB = 'true';

    test('listBackups returns mock backups', async () => {
        const backups = await listBackups('test-instance');
        assert.ok(Array.isArray(backups));
        assert.strictEqual(backups.length, 3);
        assert.strictEqual(backups[0].status, 'SUCCESSFUL');
    });

    test('createBackup returns mock operation', async () => {
        const op = await createBackup('test-instance', 'manual backup');
        assert.ok(op.includes('projects/mock/operations/backup-'));
    });

    test('restoreBackup returns mock operation', async () => {
        const op = await restoreBackup('test-instance', '1001');
        assert.ok(op.includes('projects/mock/operations/restore-1001'));
    });
});
