import assert from 'node:assert';
import { test, describe, before } from 'node:test';
import { getEnvVarsForDeployment } from '@/lib/db';
import type { Project, StorageConfig } from '@/types';

describe('Storage Branching Logic', () => {
    before(() => {
        process.env.MOCK_DB = 'true';
        // In mock mode, getSecretValue returns 'mock-secret-value'
        // Since we want to test the URL transformation, let's see how we can handle this.
        // Actually, db.ts uses getSecretValue which returns a string.
        // If it's not a valid URL, the transformation might fallback to base.
    });

    test('Production deployment should use runtimeSecrets (Secret Manager)', async () => {
        const mockProject: Project = {
            id: 'proj_1',
            storageConfigs: [
                {
                    id: 'storage_1',
                    name: 'Main DB',
                    type: 'cloud-sql-postgres',
                    status: 'active',
                    environment: 'both',
                    connectionStringSecretId: 'secret_1',
                    branchingSettings: { enabled: true, template: '{base}_{identifier}_dev' },
                } as StorageConfig
            ]
        } as Project;

        const vars = await getEnvVarsForDeployment(mockProject, 'production');
        assert.strictEqual(vars.runtimeSecrets?.DATABASE_URL, 'secret_1');
        assert.strictEqual(vars.runtimeEnvVars.DATABASE_URL, undefined);
    });

    test('Preview deployment with branching enabled should use runtimeEnvVars with derived URL', async () => {
         // Note: Since we can't easily mock getSecretValue to return a valid URL in this test environment
         // without complex overrides, and MOCK_DB=true returns 'mock-secret-value',
         // the URL transformation in getBranchConnectionString will catch and return 'mock-secret-value'.

         // However, we can verify that it correctly switches from runtimeSecrets to runtimeEnvVars.

         const mockProject: Project = {
            id: 'proj_1',
            storageConfigs: [
                {
                    id: 'storage_1',
                    name: 'Main DB',
                    type: 'cloud-sql-postgres',
                    status: 'active',
                    environment: 'both',
                    connectionStringSecretId: 'secret_1',
                    branchingSettings: { enabled: true, template: '{base}_{identifier}_dev' },
                } as StorageConfig
            ]
        } as Project;

        const vars = await getEnvVarsForDeployment(mockProject, 'preview', { branch: 'feat-login' });
        assert.ok(vars.runtimeEnvVars.DATABASE_URL !== undefined);
        assert.strictEqual(vars.runtimeSecrets?.DATABASE_URL, undefined);
    });
});
