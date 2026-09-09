import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { resolveOwnedServiceNames } from './service-ownership';
import { isValidGcpRegion, sanitizeLabel } from '@/lib/utils';
import type { Deployment, Project } from '@/types';

type DeploymentSeed = Pick<Deployment, 'type' | 'pullRequestNumber' | 'gitBranch'>;

function makeProject(partial: Partial<Project>): Project {
    return {
        id: 'proj_attacker',
        userId: 'u1',
        teamId: null,
        name: 'App',
        slug: 'a',
        region: 'us-central1',
        ...partial
    } as Project;
}

describe('resolveOwnedServiceNames', () => {
    it('claims only the exact names this project could have deployed', () => {
        const project = makeProject({ slug: 'a' });
        const deployments: DeploymentSeed[] = [
            { type: 'production', gitBranch: 'main' },
            { type: 'preview', pullRequestNumber: 7, gitBranch: 'feat' },
            { type: 'branch', gitBranch: 'staging' },
        ];

        const owned = resolveOwnedServiceNames(project, deployments);

        assert.deepStrictEqual(
            [...owned].sort(),
            ['dfy-a', 'dfy-a-pr-7', 'dfy-a-staging']
        );
    });

    it('does NOT claim another tenant whose slug merely starts with ours', () => {
        // This is the regression: prefix `dfy-a` used to sweep up every dfy-a* service.
        const owned = resolveOwnedServiceNames(makeProject({ slug: 'a' }), []);

        assert.deepStrictEqual(owned, ['dfy-a']);
        assert.ok(!owned.includes('dfy-acme-blog'));
        assert.ok(!owned.includes('dfy-analytics'));
    });

    it('rejects names that are not well-formed Cloud Run services', () => {
        // A slug carrying a path separator must never reach a resource URL.
        assert.deepStrictEqual(
            resolveOwnedServiceNames(makeProject({ slug: '../../victim' }), []),
            []
        );
    });

    it('matches the name the deploy path actually builds', () => {
        // cloudbuild.ts: generateServiceName(getProjectSlugForDeployment(project, d))
        const project = makeProject({ slug: 'my-shop' });
        const owned = resolveOwnedServiceNames(project, [
            { type: 'preview', pullRequestNumber: 12, gitBranch: 'fix/checkout' },
        ]);
        assert.ok(owned.includes('dfy-my-shop-pr-12'));
    });
});

describe('sanitizeLabel', () => {
    it('produces a legal GCP label value from a project id', () => {
        assert.strictEqual(sanitizeLabel('proj_Ab3XyZ'), 'proj_ab3xyz');
        assert.ok(sanitizeLabel('x'.repeat(100)).length <= 63);
    });
});

describe('isValidGcpRegion', () => {
    const originalFlag = process.env.VALIDATE_PROJECT_REGION;
    beforeEach(() => { delete process.env.VALIDATE_PROJECT_REGION; });
    afterEach(() => {
        if (originalFlag === undefined) delete process.env.VALIDATE_PROJECT_REGION;
        else process.env.VALIDATE_PROJECT_REGION = originalFlag;
    });

    it('accepts "use platform default"', () => {
        assert.ok(isValidGcpRegion(null));
        assert.ok(isValidGcpRegion(''));
        assert.ok(isValidGcpRegion(undefined));
    });

    it('accepts every region the UI offers', () => {
        for (const r of ['us-central1', 'europe-west4', 'asia-south1', 'me-west1', 'africa-south1']) {
            assert.ok(isValidGcpRegion(r), r);
        }
    });

    it('accepts a well-formed region we have not enumerated', () => {
        assert.ok(isValidGcpRegion('northamerica-northeast2'));
    });

    it('rejects path injection into the GCP resource name', () => {
        assert.ok(!isValidGcpRegion('us-central1/services/dfy-victim'));
        assert.ok(!isValidGcpRegion('../../../locations/us-central1'));
        assert.ok(!isValidGcpRegion({}));
    });

    it('can be switched off without a deploy', () => {
        process.env.VALIDATE_PROJECT_REGION = 'false';
        assert.ok(isValidGcpRegion('anything-at-all'));
    });
});
