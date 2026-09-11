import { test } from 'node:test';
import assert from 'node:assert';
import { remediateRisk } from './remediation-utils';
import { resolveRevocableRoles, EXCESSIVE_PROJECT_ROLES } from './iam';
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

test('remediateRisk - overprivileged_service_account (operator-enabled)', async () => {
    process.env.MOCK_DB = 'true';
    process.env.IAM_SELF_REMEDIATION_ENABLED = 'true';
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
    process.env.IAM_SELF_REMEDIATION_ENABLED = 'true';
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
    // Granular, resource-level grants still run. The PROJECT-level revoke does not: stripping
    // secretmanager.* from the shared platform service account breaks secret reads for every
    // tenant at once, so those roles are protected (see SELF_LOCKOUT_ROLES in iam.ts).
    // broadSecretAccess therefore stays set, and the message says so rather than claiming
    // a restriction that did not happen.
    assert.strictEqual(result.storageConfig?.metadata?.broadSecretAccess, true);
    assert.match(result.message, /No project-level Secret Manager role was eligible/);
});

// --- ai-cost-abuse-1: tenant-controlled metadata must not drive shared-SA IAM revocation ---

test('resolveRevocableRoles - drops roles outside the operator allowlist', () => {
    delete process.env.IAM_REMEDIATION_EXTRA_REVOCABLE_ROLES;
    delete process.env.IAM_ALLOW_SELF_LOCKOUT_REVOKE;

    const { roles, rejected } = resolveRevocableRoles([
        'roles/run.admin',
        'roles/cloudbuild.builds.editor',
        'roles/datastore.user',
        'roles/owner'
    ]);

    // Nothing is auto-revocable from the shared platform SA: run.admin /
    // cloudbuild.builds.editor / datastore.user are outside the allowlist, and roles/owner is
    // inside it but protected, because revoking it from the SHARED account is a platform-wide
    // outage. An operator opts in per-role via IAM_REMEDIATION_EXTRA_REVOCABLE_ROLES or
    // IAM_ALLOW_SELF_LOCKOUT_REVOKE.
    assert.deepStrictEqual(roles, []);
    assert.deepStrictEqual(rejected, [
        'roles/run.admin', 'roles/cloudbuild.builds.editor', 'roles/datastore.user', 'roles/owner'
    ]);
});

test('resolveRevocableRoles - an operator can still opt a role back in', () => {
    delete process.env.IAM_REMEDIATION_EXTRA_REVOCABLE_ROLES;
    process.env.IAM_ALLOW_SELF_LOCKOUT_REVOKE = 'true';
    const { roles } = resolveRevocableRoles(['roles/owner']);
    delete process.env.IAM_ALLOW_SELF_LOCKOUT_REVOKE;
    assert.deepStrictEqual(roles, ['roles/owner']);
});

test('resolveRevocableRoles - preserves legacy defaults and empty-array semantics', () => {
    delete process.env.IAM_REMEDIATION_EXTRA_REVOCABLE_ROLES;
    delete process.env.IAM_ALLOW_SELF_LOCKOUT_REVOKE;

    // undefined still selects the historical owner/editor fallback, but both are now
    // protected, so nothing is actually revoked.
    assert.deepStrictEqual(resolveRevocableRoles(undefined).roles, []);
    assert.deepStrictEqual(resolveRevocableRoles(undefined).rejected, ['roles/owner', 'roles/editor']);
    // explicit [] still means "revoke nothing", exactly as `metadata.excessiveRoles || [...]` did
    assert.deepStrictEqual(resolveRevocableRoles([]).roles, []);
    // Every role the auditor can emit is reported as over-privileged but is NOT auto-revoked
    // from the shared platform service account.
    assert.deepStrictEqual(resolveRevocableRoles([...EXCESSIVE_PROJECT_ROLES]).roles, []);
    // non-array junk revokes nothing rather than iterating a string char-by-char
    assert.deepStrictEqual(resolveRevocableRoles('roles/owner').roles, []);
});

test('resolveRevocableRoles - protects the platform SA from self-lockout by default', () => {
    delete process.env.IAM_ALLOW_SELF_LOCKOUT_REVOKE;
    assert.deepStrictEqual(resolveRevocableRoles(['roles/resourcemanager.projectIamAdmin']).roles, []);

    process.env.IAM_ALLOW_SELF_LOCKOUT_REVOKE = 'true';
    assert.deepStrictEqual(
        resolveRevocableRoles(['roles/resourcemanager.projectIamAdmin']).roles,
        ['roles/resourcemanager.projectIamAdmin']
    );
    delete process.env.IAM_ALLOW_SELF_LOCKOUT_REVOKE;
});

test('remediateRisk - overprivileged_service_account defers revocation when not operator-enabled', async () => {
    process.env.MOCK_DB = 'true';
    delete process.env.IAM_SELF_REMEDIATION_ENABLED;

    const poisoned = {
        ...mockStorage,
        metadata: {
            ...mockStorage.metadata,
            provisioned: true,
            iamOverprivileged: true,
            // attacker-supplied via PATCH body metadata merge
            excessiveRoles: ['roles/run.admin', 'roles/datastore.user']
        }
    };

    const result = await remediateRisk('proj-123', 'store-123', 'overprivileged_service_account', {
        ...mockProject,
        storageConfigs: [poisoned]
    });

    // Same response shape / success semantics the dashboard depends on
    assert.strictEqual(result.success, true);
    assert.ok(result.storageConfig);
    assert.strictEqual(result.storageConfig?.metadata?.iamHardeningDeferred, true);
    // Nothing was falsely marked clean
    assert.strictEqual(result.storageConfig?.metadata?.iamOverprivileged, true);
});
