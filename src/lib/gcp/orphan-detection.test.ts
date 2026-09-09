import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { classifyOrphan, classifyOrphanLegacy, resolveEphemeralResourceNames } from './orphan-detection';
import type { OrphanContext } from './orphan-detection';
import type { Deployment, Project, StorageConfig } from '@/types';

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

function makeProject(partial: Partial<Project> = {}): Project {
    return {
        id: 'proj_acme',
        userId: 'u1',
        teamId: null,
        name: 'Acme',
        slug: 'acme',
        region: 'us-central1',
        storageConfigs: [],
        ...partial
    } as Project;
}

function makeDeployment(partial: Partial<Deployment>): Deployment {
    return {
        id: 'dep_1',
        projectId: 'proj_acme',
        type: 'preview',
        status: 'ready',
        gitBranch: 'feature/login',
        gitCommitSha: 'abc',
        gitCommitMessage: 'm',
        gitCommitAuthor: 'a',
        ...partial
    } as Deployment;
}

function makeContext(partial: Partial<OrphanContext> = {}): OrphanContext {
    return {
        project: makeProject(),
        deployments: [],
        legacyActivePatterns: [],
        ...partial
    };
}

/** The label pair syncResourceLabels() writes for proj_acme. */
const OWNED_LABELS = { managedBy: 'deployify', deployifyProjectId: 'proj_acme' };

describe('resolveEphemeralResourceNames', () => {
    beforeEach(() => {
        delete process.env.GCP_ORPHAN_DETECTION;
    });

    it('derives the same names the deploy path derives, split by liveness', () => {
        const { active, retired } = resolveEphemeralResourceNames(makeProject(), [
            makeDeployment({ type: 'preview', pullRequestNumber: 7, status: 'ready' }),
            makeDeployment({ type: 'preview', pullRequestNumber: 8, status: 'cancelled' }),
            makeDeployment({ type: 'branch', gitBranch: 'feature/login', status: 'error' })
        ]);

        assert.ok(active.has('acme-pr-7'));
        assert.ok(retired.has('acme-pr-8'));
        assert.ok(retired.has('acme-feature-login'));
        assert.ok(!retired.has('acme-pr-7'));
    });

    it('never treats the bare production slug as ephemeral', () => {
        const { active, retired } = resolveEphemeralResourceNames(makeProject(), [
            makeDeployment({ type: 'production', status: 'ready' }),
            // A preview row with no PR number falls through to the production slug.
            makeDeployment({ type: 'preview', pullRequestNumber: undefined, status: 'error' })
        ]);
        assert.ok(!active.has('acme'));
        assert.ok(!retired.has('acme'));
    });

    it('a re-run of the same PR keeps the name protected', () => {
        const { retired } = resolveEphemeralResourceNames(makeProject(), [
            makeDeployment({ id: 'd1', type: 'preview', pullRequestNumber: 7, status: 'error' }),
            makeDeployment({ id: 'd2', type: 'preview', pullRequestNumber: 7, status: 'building' })
        ]);
        assert.ok(!retired.has('acme-pr-7'));
    });
});

describe('classifyOrphan (strict, the default)', () => {
    beforeEach(() => {
        delete process.env.GCP_ORPHAN_DETECTION;
    });

    it('does NOT flag a customer instance that merely contains -pr- (defect product-ux-6)', () => {
        const verdict = classifyOrphan(
            { id: 'acme-pr-analytics', name: 'acme-pr-analytics', type: 'cloud-sql' },
            makeContext()
        );
        assert.strictEqual(verdict.orphaned, false);
    });

    it('does NOT flag a resource backing a registered connector, whatever it is named', () => {
        const project = makeProject({
            storageConfigs: [makeStorage({ name: 'Acme PR 5', metadata: { resourceName: 'acme-pr-5' } })]
        });
        const verdict = classifyOrphan(
            { id: 'acme-pr-5', name: 'acme-pr-5', type: 'cloud-sql', metadata: OWNED_LABELS },
            makeContext({ project })
        );
        assert.strictEqual(verdict.orphaned, false);
        assert.match(verdict.reason, /in use by a storage connector/i);
    });

    it('does NOT flag a labelled resource whose preview deployment is still live', () => {
        const verdict = classifyOrphan(
            { id: 'acme-pr-7', name: 'acme-pr-7', type: 'cloud-sql', metadata: OWNED_LABELS },
            makeContext({ deployments: [makeDeployment({ type: 'preview', pullRequestNumber: 7, status: 'ready' })] })
        );
        assert.strictEqual(verdict.orphaned, false);
    });

    it('does NOT flag a resource labelled for a DIFFERENT Deployify project', () => {
        const verdict = classifyOrphan(
            {
                id: 'acme-pr-8',
                name: 'acme-pr-8',
                type: 'cloud-sql',
                metadata: { managedBy: 'deployify', deployifyProjectId: 'proj_someone_else' }
            },
            makeContext({ deployments: [makeDeployment({ type: 'preview', pullRequestNumber: 8, status: 'cancelled' })] })
        );
        assert.strictEqual(verdict.orphaned, false);
    });

    it('never flags a Firestore database (no labels exist, deletion is irreversible)', () => {
        const verdict = classifyOrphan(
            { id: 'acme-pr-8', name: 'acme-pr-8', type: 'firestore', metadata: { type: 'FIRESTORE_NATIVE' } },
            makeContext({ deployments: [makeDeployment({ type: 'preview', pullRequestNumber: 8, status: 'error' })] })
        );
        assert.strictEqual(verdict.orphaned, false);
    });

    it('DOES flag a labelled resource whose deployment is retired', () => {
        const verdict = classifyOrphan(
            { id: 'acme-pr-8', name: 'acme-pr-8', type: 'cloud-sql', metadata: OWNED_LABELS },
            makeContext({ deployments: [makeDeployment({ type: 'preview', pullRequestNumber: 8, status: 'cancelled' })] })
        );
        assert.strictEqual(verdict.orphaned, true);
    });
});

describe('classifyOrphan (GCP_ORPHAN_DETECTION=legacy break-glass)', () => {
    beforeEach(() => {
        process.env.GCP_ORPHAN_DETECTION = 'legacy';
    });

    it('reproduces the pre-fix heuristic exactly', () => {
        const ctx = makeContext({ legacyActivePatterns: ['pr123'] });
        assert.strictEqual(
            classifyOrphan({ id: 'acme-pr-analytics', name: 'acme-pr-analytics', type: 'cloud-sql' }, ctx).orphaned,
            classifyOrphanLegacy('acme-pr-analytics', ['pr123']).orphaned
        );
        assert.strictEqual(classifyOrphanLegacy('acme-pr-analytics', ['pr123']).orphaned, true);
        assert.strictEqual(classifyOrphanLegacy('acme-prod-db', ['pr123']).orphaned, false);
        assert.strictEqual(classifyOrphanLegacy('acme-pr-123', []).orphaned, false);
    });
});
