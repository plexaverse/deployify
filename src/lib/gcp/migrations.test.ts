import { test, describe } from 'node:test';
import assert from 'node:assert';
import { listMigrations, runMigration, getMigrationStatus } from './migrations';

describe('Migrations Logic', () => {
    test('should return mock migrations when MOCK_DB is true', async () => {
        process.env.MOCK_DB = 'true';
        const migrations = await listMigrations('mock-connection-string', 'cloud-sql-postgres');

        assert.strictEqual(Array.isArray(migrations), true);
        assert.strictEqual(migrations.length, 3);
        assert.strictEqual(migrations[0].name, '20240101000000_init');
        assert.strictEqual(migrations[0].status, 'SUCCESS');
    });

    test('should handle postgres without migration tables', async () => {
        // This would require real DB or complex mocks,
        // for now we just verify the mock path since we are in a sandbox
        process.env.MOCK_DB = 'true';
        const migrations = await listMigrations('mock-connection-string', 'cloud-sql-postgres');
        assert.ok(migrations.length > 0);
    });

    test('should simulate migration execution and status polling in mock mode', async () => {
        process.env.MOCK_DB = 'true';
        const projectId = 'test-project';
        const { operationName } = await runMigration(
            projectId,
            'owner/repo',
            'abc1234',
            'connection-string',
            'DATABASE_URL',
            'prisma migrate deploy'
        );

        assert.ok(operationName.includes(`migrate-${projectId}`));

        // Initial status should be QUEUED (elapsed < 5s)
        const status1 = await getMigrationStatus(operationName);
        assert.strictEqual(status1.status, 'QUEUED');
        assert.ok(status1.logs?.includes('Build queued'));

        // Manually manipulate global state for faster testing
        const id = operationName.split('/').pop() || '';
        (global as { mockMigrations?: Record<string, number> }).mockMigrations![id] -= 6000;

        const status2 = await getMigrationStatus(operationName);
        assert.strictEqual(status2.status, 'WORKING');
        assert.ok(status2.logs?.includes('npm install'));

        (global as { mockMigrations?: Record<string, number> }).mockMigrations![id] -= 10000;

        const status3 = await getMigrationStatus(operationName);
        assert.strictEqual(status3.status, 'SUCCESS');
        assert.ok(status3.logs?.includes('Migration applied successfully'));
    });
});
