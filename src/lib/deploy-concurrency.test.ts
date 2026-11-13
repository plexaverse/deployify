import { test } from 'node:test';
import assert from 'node:assert';
import {
    ACTIVE_DEPLOYMENT_STATUSES,
    decideSupersede,
    deployCreatedAtMillis,
    deployTargetKey,
    getDeployConcurrencyMode,
    isNewerDeployRow,
    type DeployRow,
} from './deploy-concurrency';
import type { Deployment } from '@/types';

const PROJECT = { slug: 'acme-web' };

function row(over: Partial<DeployRow> & Pick<DeployRow, 'id'>): DeployRow {
    return {
        status: 'building',
        createdAtMs: 1_000,
        target: 'dfy-acme-web',
        ...over,
    };
}

test('DEPLOY_CONCURRENCY_MODE parsing', async (t) => {
    const prevMode = process.env.DEPLOY_CONCURRENCY_MODE;
    const prevMock = process.env.MOCK_DB;
    t.after(() => {
        if (prevMode === undefined) delete process.env.DEPLOY_CONCURRENCY_MODE;
        else process.env.DEPLOY_CONCURRENCY_MODE = prevMode;
        if (prevMock === undefined) delete process.env.MOCK_DB;
        else process.env.MOCK_DB = prevMock;
    });

    await t.test('defaults to off - today behaviour', () => {
        delete process.env.MOCK_DB;
        delete process.env.DEPLOY_CONCURRENCY_MODE;
        assert.strictEqual(getDeployConcurrencyMode(), 'off');
        process.env.DEPLOY_CONCURRENCY_MODE = '';
        assert.strictEqual(getDeployConcurrencyMode(), 'off');
        process.env.DEPLOY_CONCURRENCY_MODE = 'nonsense';
        assert.strictEqual(getDeployConcurrencyMode(), 'off');
    });

    await t.test('accepts audit and supersede, case/space insensitive', () => {
        delete process.env.MOCK_DB;
        process.env.DEPLOY_CONCURRENCY_MODE = ' AUDIT ';
        assert.strictEqual(getDeployConcurrencyMode(), 'audit');
        process.env.DEPLOY_CONCURRENCY_MODE = 'Supersede';
        assert.strictEqual(getDeployConcurrencyMode(), 'supersede');
    });

    await t.test('MOCK_DB forces off - local dev keeps today code path', () => {
        process.env.MOCK_DB = 'true';
        process.env.DEPLOY_CONCURRENCY_MODE = 'supersede';
        assert.strictEqual(getDeployConcurrencyMode(), 'off');
    });
});

test('deployTargetKey matches the service name the build config uses', async (t) => {
    await t.test('production targets dfy-<slug>', () => {
        assert.strictEqual(
            deployTargetKey(PROJECT, { type: 'production', gitBranch: 'main' }),
            'dfy-acme-web'
        );
    });

    await t.test('branch deployments get their own service', () => {
        assert.strictEqual(
            deployTargetKey(PROJECT, { type: 'branch', gitBranch: 'feat/Login Page' }),
            'dfy-acme-web-feat-login-page'
        );
    });

    await t.test('preview deployments are keyed by PR number', () => {
        assert.strictEqual(
            deployTargetKey(PROJECT, { type: 'preview', gitBranch: 'x', pullRequestNumber: 42 }),
            'dfy-acme-web-pr-42'
        );
    });

    await t.test('legacy/unmappable rows return null instead of guessing', () => {
        assert.strictEqual(
            deployTargetKey(PROJECT, { type: 'branch', gitBranch: undefined as unknown as string }),
            null
        );
        assert.strictEqual(
            deployTargetKey(PROJECT, { type: 'nope' as Deployment['type'], gitBranch: 'main' }),
            null
        );
        assert.strictEqual(deployTargetKey({ slug: '' }, { type: 'production', gitBranch: 'main' }), null);
    });
});

test('decideSupersede', async (t) => {
    const self = row({ id: 'deploy_b', createdAtMs: 2_000, status: 'queued' });
    const older = row({ id: 'deploy_a', createdAtMs: 1_000, cloudBuildId: 'build-a' });

    await t.test('off mode is inert even with a live rival', () => {
        const d = decideSupersede('off', self, [self, older]);
        assert.deepStrictEqual(d.supersede, []);
        assert.strictEqual(d.blockedBy, null);
    });

    await t.test('audit and supersede both see the older in-flight build', () => {
        for (const mode of ['audit', 'supersede'] as const) {
            const d = decideSupersede(mode, self, [self, older]);
            assert.deepStrictEqual(d.supersede.map(r => r.id), ['deploy_a']);
            assert.strictEqual(d.blockedBy, null);
        }
    });

    await t.test('terminal rivals are left alone', () => {
        for (const status of ['ready', 'error', 'cancelled'] as const) {
            const d = decideSupersede('supersede', self, [self, row({ id: 'deploy_a', createdAtMs: 1_000, status })]);
            assert.deepStrictEqual(d.supersede, []);
        }
    });

    await t.test('a different target is not a rival', () => {
        const d = decideSupersede('supersede', self, [
            self,
            row({ id: 'deploy_a', createdAtMs: 1_000, target: 'dfy-acme-web-pr-7' }),
            row({ id: 'deploy_z', createdAtMs: 1_000, target: null }),
        ]);
        assert.deepStrictEqual(d.supersede, []);
    });

    await t.test('a null self target never cancels anything', () => {
        const d = decideSupersede('supersede', { ...self, target: null }, [self, older]);
        assert.deepStrictEqual(d.supersede, []);
        assert.strictEqual(d.blockedBy, null);
    });

    await t.test('the loser of the race blocks itself instead of cancelling the winner', () => {
        const newer = row({ id: 'deploy_c', createdAtMs: 3_000 });
        const d = decideSupersede('supersede', self, [self, older, newer]);
        assert.strictEqual(d.blockedBy?.id, 'deploy_c');
        assert.deepStrictEqual(d.supersede, [], 'blocked request must not cancel anyone');
    });

    await t.test('both sides of a same-millisecond race agree on one winner', () => {
        const a = row({ id: 'deploy_a', createdAtMs: 5_000, status: 'queued' });
        const b = row({ id: 'deploy_b', createdAtMs: 5_000, status: 'queued' });
        const fromA = decideSupersede('supersede', a, [a, b]);
        const fromB = decideSupersede('supersede', b, [a, b]);
        assert.strictEqual(fromA.blockedBy?.id, 'deploy_b', 'a is the older id, so a stands down');
        assert.deepStrictEqual(fromB.supersede.map(r => r.id), ['deploy_a']);
        assert.strictEqual(fromB.blockedBy, null);
    });

    await t.test('the newest rival is reported when several are newer', () => {
        const d = decideSupersede('supersede', self, [
            self,
            row({ id: 'deploy_c', createdAtMs: 3_000 }),
            row({ id: 'deploy_d', createdAtMs: 4_000 }),
        ]);
        assert.strictEqual(d.blockedBy?.id, 'deploy_d');
    });
});

test('deployCreatedAtMillis normalises every createdAt shape', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    assert.strictEqual(deployCreatedAtMillis(d), d.getTime());
    assert.strictEqual(deployCreatedAtMillis(d.getTime()), d.getTime());
    assert.strictEqual(deployCreatedAtMillis(d.toISOString()), d.getTime());
    assert.strictEqual(deployCreatedAtMillis({ toDate: () => d }), d.getTime());
    assert.strictEqual(deployCreatedAtMillis(undefined), 0);
    assert.strictEqual(deployCreatedAtMillis('not a date'), 0);
});

test('ACTIVE_DEPLOYMENT_STATUSES covers exactly the pre-terminal statuses', () => {
    assert.deepStrictEqual([...ACTIVE_DEPLOYMENT_STATUSES].sort(), ['building', 'deploying', 'queued']);
});

test('isNewerDeployRow is a strict total order', () => {
    assert.strictEqual(isNewerDeployRow({ id: 'a', createdAtMs: 2 }, { id: 'b', createdAtMs: 1 }), true);
    assert.strictEqual(isNewerDeployRow({ id: 'a', createdAtMs: 1 }, { id: 'b', createdAtMs: 2 }), false);
    assert.strictEqual(isNewerDeployRow({ id: 'b', createdAtMs: 1 }, { id: 'a', createdAtMs: 1 }), true);
    assert.strictEqual(isNewerDeployRow({ id: 'a', createdAtMs: 1 }, { id: 'a', createdAtMs: 1 }), false);
});
