import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { discoverDeadlocks, calculateDeadlockImpact, type LogEntry } from './monitoring';
import type { StorageConfig } from '@/types';


let originalMockDb: string | undefined;

before(() => {
    originalMockDb = process.env.MOCK_DB;
    delete process.env.MOCK_DB;
});

after(() => {
    if (originalMockDb !== undefined) {
        process.env.MOCK_DB = originalMockDb;
    } else {
        delete process.env.MOCK_DB;
    }
});

test('calculateDeadlockImpact', () => {
    assert.strictEqual(calculateDeadlockImpact(1), 20);
    assert.strictEqual(calculateDeadlockImpact(3), 60);
    assert.strictEqual(calculateDeadlockImpact(5), 100);
    assert.strictEqual(calculateDeadlockImpact(10), 100); // Capped at 100
});

test('discoverDeadlocks - Postgres log pattern', async () => {
    const storage: StorageConfig = {
        id: 's1',
        type: 'cloud-sql-postgres',
        name: 'Postgres DB',
        status: 'active',
        environment: 'production',
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const logs: LogEntry[] = [
        {
            timestamp: new Date().toISOString(),
            severity: 'ERROR',
            textPayload: 'ERROR:  deadlock detected\nDETAIL:  Process 12345 waits for ShareLock on transaction 678; blocked by process 67890.',
            insertId: 'log-1'
        }
    ];

    const report = await discoverDeadlocks(storage, logs);
    assert.strictEqual(report.hasDeadlocks, true);
    assert.strictEqual(report.incidents.length, 1);
    assert.strictEqual(report.incidents[0].remediation.includes('PostgreSQL'), true);
});

test('discoverDeadlocks - MySQL log pattern', async () => {
    const storage: StorageConfig = {
        id: 's2',
        type: 'cloud-sql-mysql',
        name: 'MySQL DB',
        status: 'active',
        environment: 'production',
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const logs: LogEntry[] = [
        {
            timestamp: new Date().toISOString(),
            severity: 'ERROR',
            textPayload: '2024-07-25T10:00:00.000000Z 123 [Note] InnoDB: Deadlock found when trying to get lock; try restarting transaction',
            insertId: 'log-2'
        }
    ];

    const report = await discoverDeadlocks(storage, logs);
    assert.strictEqual(report.hasDeadlocks, true);
    assert.strictEqual(report.incidents.length, 1);
    assert.strictEqual(report.incidents[0].remediation.includes('MySQL'), true);
});

test('discoverDeadlocks - No deadlocks', async () => {
    const storage: StorageConfig = {
        id: 's3',
        type: 'cloud-sql-postgres',
        name: 'Clean DB',
        status: 'active',
        environment: 'production',
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const logs: LogEntry[] = [
        {
            timestamp: new Date().toISOString(),
            severity: 'INFO',
            textPayload: 'Database connection established',
            insertId: 'log-3'
        }
    ];

    const report = await discoverDeadlocks(storage, logs);
    assert.strictEqual(report.hasDeadlocks, false);
    assert.strictEqual(report.incidents.length, 0);
});
