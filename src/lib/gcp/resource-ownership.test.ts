import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resolveOwnedResourceNames, checkResourceOwnership } from './resource-ownership';
import type { Project, StorageConfig } from '@/types';

function makeStorage(partial: Partial<StorageConfig>): StorageConfig {
    return {
        id: 'st_1',
        type: 'cloud-sql-postgres',
        name: 'Prod DB',
        status: 'active',
        environment: 'both',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial
    } as StorageConfig;
}

function makeProject(partial: Partial<Project>): Project {
    return {
        id: 'proj_victim',
        userId: 'u1',
        teamId: null,
        name: 'App',
        slug: 'app',
        region: 'us-central1',
        storageConfigs: [],
        ...partial
    } as Project;
}

describe('resolveOwnedResourceNames', () => {
    it('claims server-written metadata.resourceName and its derived names', () => {
        const project = makeProject({
            storageConfigs: [
                makeStorage({ name: 'Prod DB', metadata: { resourceName: 'prod-db', region: 'us-central1' } })
            ]
        });

        const owned = resolveOwnedResourceNames(project);
        assert.ok(owned.has('prod-db'));
        assert.ok(owned.has('prod-db-us-central1')); // migrateInstanceToRegion target
        assert.ok(owned.has('prod-db-migrated'));
        assert.ok(!owned.has('victim-db'));
    });

    // Regression: the display name is free text from the request body. Deriving ownership
    // from it let a tenant claim any resource by naming a connector after it, then reclaim
    // (delete) it. Ownership must come from server-written metadata or the GCP label only.
    it('does NOT claim a resource just because a connector is named after it', () => {
        const project = makeProject({
            storageConfigs: [makeStorage({ id: 'st_2', name: 'Victim Prod DB' })]
        });

        const owned = resolveOwnedResourceNames(project);
        assert.ok(!owned.has('victim-prod-db'), 'display name must never grant ownership');
        assert.strictEqual(owned.size, 0);
    });

    it('claims recorded read replicas', () => {
        const project = makeProject({
            storageConfigs: [makeStorage({
                metadata: {
                    resourceName: 'prod-db',
                    replicas: [{ id: 'replica-1', name: 'prod-db-replica-1' }]
                }
            })]
        });
        assert.ok(resolveOwnedResourceNames(project).has('prod-db-replica-1'));
    });
});

describe('checkResourceOwnership', () => {
    beforeEach(() => {
        delete process.env.MOCK_DB;
        process.env.GCP_PROJECT_ID = 'deployify-shared';
        process.env.GCP_RECLAIM_LABEL_FALLBACK = 'false'; // keep the test offline
        delete process.env.GCP_RECLAIM_OWNERSHIP_MODE;
    });

    it('denies deleting an instance the project does not claim (the CVE)', async () => {
        const attacker = makeProject({ id: 'proj_attacker', storageConfigs: [] });
        const result = await checkResourceOwnership(attacker, 'cloud-sql', 'victim-prod-db', 'us-central1', null);
        assert.strictEqual(result.owned, false);
    });

    it('allows deleting an instance the project provisioned', async () => {
        const project = makeProject({
            storageConfigs: [makeStorage({ metadata: { resourceName: 'prod-db' } })]
        });
        const result = await checkResourceOwnership(project, 'cloud-sql', 'prod-db', 'us-central1', null);
        assert.strictEqual(result.owned, true);
    });

    it('never allows reclaiming the platform default Firestore database', async () => {
        const project = makeProject({
            storageConfigs: [makeStorage({ type: 'firestore', metadata: { resourceName: '(default)' } })]
        });
        const result = await checkResourceOwnership(project, 'firestore', '(default)', null, null);
        assert.strictEqual(result.owned, false);
    });

    it('denies an unregistered bring-your-own GCP project', async () => {
        const project = makeProject({ storageConfigs: [makeStorage({ metadata: { resourceName: 'prod-db' } })] });
        const result = await checkResourceOwnership(project, 'cloud-sql', 'prod-db', 'us-central1', 'someone-elses-gcp');
        assert.strictEqual(result.owned, false);
    });

    it('allows a resource this project provisioned in a registered bring-your-own project', async () => {
        const project = makeProject({
            storageConfigs: [makeStorage({ providerProjectId: 'tenant-own-gcp', metadata: { resourceName: 'prod-db' } })]
        });
        const result = await checkResourceOwnership(project, 'cloud-sql', 'prod-db', 'us-central1', 'tenant-own-gcp');
        assert.strictEqual(result.owned, true);
    });

    // Regression: providerProjectId is an unvalidated request-body field. Treating it as a
    // blanket grant let a tenant PATCH someone else's GCP project id onto their own connector
    // and then delete any resource the platform service account could reach there.
    it('does NOT grant every resource in a registered bring-your-own project', async () => {
        const project = makeProject({
            storageConfigs: [makeStorage({ providerProjectId: 'tenant-own-gcp', metadata: { resourceName: 'prod-db' } })]
        });
        const result = await checkResourceOwnership(project, 'cloud-sql', 'someone-elses-db', 'us-central1', 'tenant-own-gcp');
        assert.strictEqual(result.owned, false);
    });

    it('restores the blanket grant behind GCP_BYO_PROJECT_BLANKET_OWNERSHIP', async () => {
        process.env.GCP_BYO_PROJECT_BLANKET_OWNERSHIP = 'true';
        const project = makeProject({
            storageConfigs: [makeStorage({ providerProjectId: 'tenant-own-gcp', metadata: { resourceName: 'prod-db' } })]
        });
        const result = await checkResourceOwnership(project, 'cloud-sql', 'anything', 'us-central1', 'tenant-own-gcp');
        delete process.env.GCP_BYO_PROJECT_BLANKET_OWNERSHIP;
        assert.strictEqual(result.owned, true);
    });

    it('stays permissive under MOCK_DB so local dev keeps working', async () => {
        process.env.MOCK_DB = 'true';
        const project = makeProject({ storageConfigs: [] });
        const result = await checkResourceOwnership(project, 'cloud-sql', 'orphan-db-pr-123', 'us-central1', null);
        assert.strictEqual(result.owned, true);
    });
});
