import { test } from 'node:test';
import assert from 'node:assert';
import { remediateRisk } from './remediation-utils';
import type { Project, StorageConfig } from '@/types';

// Mock storage config
const mockStorage: StorageConfig = {
    id: 'store-123',
    type: 'cloud-sql-postgres',
    name: 'Production DB',
    status: 'active',
    environment: 'production',
    ssl: false,
    metadata: {
        resourceName: 'prod-db-instance',
        projectId: 'test-project'
    },
    createdAt: new Date(),
    updatedAt: new Date()
};

// Mock project
const mockProject: Project = {
    id: 'proj-123',
    userId: 'user-123',
    teamId: null,
    name: 'Test Project',
    slug: 'test-project',
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

test('remediateRisk - unencrypted_connection', async () => {
    process.env.MOCK_DB = 'true';
    const result = await remediateRisk('proj-123', 'store-123', 'unencrypted_connection', mockProject);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.storageConfig?.ssl, true);
    assert.match(result.message, /SSL\/TLS enforcement enabled/);
});

test('remediateRisk - deletion_protection_disabled', async () => {
    process.env.MOCK_DB = 'true';
    const result = await remediateRisk('proj-123', 'store-123', 'deletion_protection_disabled', mockProject);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.storageConfig?.metadata?.deletionProtection, true);
    assert.strictEqual(result.storageConfig?.status, 'provisioning');
});

test('remediateRisk - invalid riskId', async () => {
    const result = await remediateRisk('proj-123', 'store-123', 'invalid_risk', mockProject);

    assert.strictEqual(result.success, false);
    assert.match(result.message, /Unsupported risk remediation/);
});

test('remediateRisk - storage not found', async () => {
    const result = await remediateRisk('proj-123', 'non-existent', 'unencrypted_connection', mockProject);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'Storage connector not found');
});

test('remediateRisk - overprivileged_service_account', async () => {
    process.env.MOCK_DB = 'true';
    const storageWithRoles = {
        ...mockStorage,
        metadata: {
            ...mockStorage.metadata,
            provisioned: true,
            iamOverprivileged: true,
            excessiveRoles: ['roles/owner'],
            connectionStringSecretId: 'test-secret'
        }
    };
    const projectWithRoles = {
        ...mockProject,
        storageConfigs: [storageWithRoles]
    };

    const result = await remediateRisk('proj-123', 'store-123', 'overprivileged_service_account', projectWithRoles);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.storageConfig?.metadata?.iamOverprivileged, false);
    assert.strictEqual(result.storageConfig?.metadata?.broadSecretAccess, false);
    assert.deepStrictEqual(result.storageConfig?.metadata?.excessiveRoles, []);
    assert.match(result.message, /IAM Hardening complete/);
});

test('remediateRisk - broad_secret_access', async () => {
    process.env.MOCK_DB = 'true';
    const storageWithBroadAccess = {
        ...mockStorage,
        metadata: {
            ...mockStorage.metadata,
            provisioned: true,
            broadSecretAccess: true
        },
        connectionStringSecretId: 'test-secret'
    };
    const projectWithBroadAccess = {
        ...mockProject,
        storageConfigs: [storageWithBroadAccess]
    };

    const result = await remediateRisk('proj-123', 'store-123', 'broad_secret_access', projectWithBroadAccess);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.storageConfig?.metadata?.broadSecretAccess, false);
    assert.match(result.message, /Secret access restricted/);
});
