import { test } from 'node:test';
import assert from 'node:assert';
import { syncSchema } from './schema-sync';
import type { StorageConfig } from '@/types';

const sourceStorage: StorageConfig = {
    id: 'source-123',
    type: 'cloud-sql-postgres',
    name: 'Source DB',
    status: 'active',
    environment: 'production',
    metadata: {
        resourceName: 'source-db-instance'
    },
    createdAt: new Date(),
    updatedAt: new Date()
};

const targetStorage: StorageConfig = {
    id: 'target-456',
    type: 'cloud-sql-postgres',
    name: 'Target DB',
    status: 'active',
    environment: 'preview',
    metadata: {
        resourceName: 'target-db-instance'
    },
    createdAt: new Date(),
    updatedAt: new Date()
};

test('syncSchema - Cloud SQL success', async () => {
    process.env.MOCK_DB = 'true';
    const result = await syncSchema(sourceStorage, targetStorage, 'test-bucket');

    assert.strictEqual(result.success, true);
    assert.match(result.message, /Schema synchronization orchestrated/);
    assert.ok(result.operationName);
    assert.ok(result.storageUri);
    assert.match(result.storageUri, /^gs:\/\/test-bucket\/sync-exports\//);
});

test('syncSchema - Unsupported type', async () => {
    const redisStorage: StorageConfig = {
        ...sourceStorage,
        type: 'memorystore-redis'
    };

    const result = await syncSchema(redisStorage, targetStorage, 'test-bucket');

    assert.strictEqual(result.success, false);
    assert.match(result.message, /only supported for Cloud SQL/);
});

test('syncSchema - Missing resource names', async () => {
    const invalidStorage: StorageConfig = {
        ...sourceStorage,
        metadata: {}
    };

    const result = await syncSchema(invalidStorage, targetStorage, 'test-bucket');

    assert.strictEqual(result.success, false);
    assert.match(result.message, /must have valid GCP resource names/);
});
