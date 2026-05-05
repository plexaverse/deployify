import { test } from 'node:test';
import assert from 'node:assert';
import { runExternalDump, ingestExternalToNative } from './ingestion';
import type { StorageConfig, Project } from '@/types';

// Mock storage config
const mockStorage: StorageConfig = {
    id: 'source-id',
    type: 'supabase',
    name: 'Source DB',
    status: 'active',
    environment: 'production',
    connectionStringSecretId: 'source-secret',
    createdAt: new Date(),
    updatedAt: new Date()
};

// Mock project
const mockProject: Project = {
    id: 'project-id',
    name: 'Test Project',
    slug: 'test-project',
    userId: 'user-id',
    teamId: null,
    repoFullName: 'owner/repo',
    repoUrl: 'https://github.com/owner/repo',
    defaultBranch: 'main',
    framework: 'nextjs',
    buildCommand: 'npm run build',
    installCommand: 'npm install',
    outputDirectory: '.next',
    rootDirectory: '',
    cloudRunServiceId: null,
    productionUrl: null,
    region: 'us-central1',
    customDomain: null,
    storageConfigs: [mockStorage],
    createdAt: new Date(),
    updatedAt: new Date()
};

test('runExternalDump handles multiple databases', async () => {
    process.env.MOCK_DB = 'true';
    const buildId = await runExternalDump('project-id', mockStorage, 'gs://bucket/folder/', ['db1', 'db2']);
    assert.strictEqual(buildId, 'mock-build-id');
});

test('ingestExternalToNative initializes metadata for multi-db', async () => {
    process.env.MOCK_DB = 'true';
    const result = await ingestExternalToNative('project-id', 'source-id', mockProject, {
        dbType: 'postgres',
        databases: 'db1, db2'
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.targetStorageId);
});
