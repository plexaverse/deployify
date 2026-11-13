import { test } from 'node:test';
import assert from 'node:assert';
import {
    pickRepoBindingOwner,
    buildRepoVerification,
    isWebhookAlreadyExistsError,
    repoOwnerKey,
    getRepoBindingMode,
    getRepoResolutionMode,
} from './repo-binding';

type FakeDoc = { id: string; data: () => Record<string, unknown> };

const doc = (
    id: string,
    opts: { userId?: string; teamId?: string | null; admin?: boolean; createdAt?: unknown } = {}
): FakeDoc => ({
    id,
    data: () => ({
        id,
        repoFullName: 'victim-org/public-app',
        userId: opts.userId ?? 'victim',
        teamId: opts.teamId ?? null,
        createdAt: opts.createdAt,
        repoVerification: opts.admin === undefined
            ? undefined
            : { level: opts.admin ? 'admin' : 'unverified', webhookId: opts.admin ? 1 : null, verifiedAt: new Date() },
    }),
});

// Firestore returns __name__ ascending for a where()+limit() query with no orderBy, so
// docs[0] is the lowest document id. Project ids are proj_<random base36>, which means a
// squatter can retry creation until their id sorts below the victim's and steals the
// victim's webhook deliveries.
const VICTIM = doc('proj_zzzzzzzzzzzz', { userId: 'victim', admin: true, createdAt: new Date('2025-01-01T00:00:00Z') });
const SQUATTER = doc('proj_aaaaaaaaaaaa', { userId: 'attacker', admin: false, createdAt: new Date('2026-09-01T00:00:00Z') });

test('repo binding owner resolution', async (t) => {
    const prevMode = process.env.PROJECT_REPO_RESOLUTION_MODE;
    const prevMock = process.env.MOCK_DB;
    t.after(() => {
        if (prevMode === undefined) delete process.env.PROJECT_REPO_RESOLUTION_MODE;
        else process.env.PROJECT_REPO_RESOLUTION_MODE = prevMode;
        if (prevMock === undefined) delete process.env.MOCK_DB;
        else process.env.MOCK_DB = prevMock;
    });

    t.beforeEach(() => {
        delete process.env.PROJECT_REPO_RESOLUTION_MODE;
        delete process.env.MOCK_DB;
    });

    await t.test('single match is returned untouched', () => {
        assert.strictEqual(pickRepoBindingOwner([VICTIM], 'victim-org/public-app').id, VICTIM.id);
    });

    await t.test('legacy is the default and preserves today\'s winner exactly', () => {
        assert.strictEqual(getRepoResolutionMode(), 'legacy');
        assert.strictEqual(pickRepoBindingOwner([SQUATTER, VICTIM], 'victim-org/public-app').id, SQUATTER.id);
    });

    await t.test('verified-first gives deliveries back to the repo admin', () => {
        process.env.PROJECT_REPO_RESOLUTION_MODE = 'verified-first';
        assert.strictEqual(pickRepoBindingOwner([SQUATTER, VICTIM], 'victim-org/public-app').id, VICTIM.id);
    });

    await t.test('legacy data with no verification anywhere keeps docs[0] - provable no-op pre-backfill', () => {
        process.env.PROJECT_REPO_RESOLUTION_MODE = 'verified-first';
        const a = doc('proj_aaa', { userId: 'attacker' });
        const b = doc('proj_bbb', { userId: 'victim' });
        assert.strictEqual(pickRepoBindingOwner([a, b], 'victim-org/public-app').id, a.id);
    });

    await t.test('one tenant with several projects on one repo (monorepo) is never re-pointed', () => {
        process.env.PROJECT_REPO_RESOLUTION_MODE = 'verified-first';
        const newer = doc('proj_aaa', { userId: 'same', admin: false, createdAt: new Date('2026-01-01T00:00:00Z') });
        const older = doc('proj_zzz', { userId: 'same', admin: true, createdAt: new Date('2024-01-01T00:00:00Z') });
        assert.strictEqual(pickRepoBindingOwner([newer, older], 'victim-org/public-app').id, newer.id);
    });

    await t.test('team ownership is keyed on the team, not the member who created it', () => {
        process.env.PROJECT_REPO_RESOLUTION_MODE = 'verified-first';
        const a = doc('proj_aaa', { userId: 'alice', teamId: 'team_1', admin: false });
        const b = doc('proj_bbb', { userId: 'bob', teamId: 'team_1', admin: true });
        // Same team -> monorepo, docs[0] stands.
        assert.strictEqual(pickRepoBindingOwner([a, b], 'victim-org/public-app').id, a.id);
    });

    await t.test('an already-verified incumbent is never displaced', () => {
        process.env.PROJECT_REPO_RESOLUTION_MODE = 'verified-first';
        const incumbent = doc('proj_aaa', { userId: 'victim', admin: true, createdAt: new Date('2026-01-01T00:00:00Z') });
        const olderOther = doc('proj_zzz', { userId: 'other', admin: true, createdAt: new Date('2024-01-01T00:00:00Z') });
        assert.strictEqual(pickRepoBindingOwner([incumbent, olderOther], 'victim-org/public-app').id, incumbent.id);
    });

    await t.test('MOCK_DB pins legacy even when the flag is flipped', () => {
        process.env.MOCK_DB = 'true';
        process.env.PROJECT_REPO_RESOLUTION_MODE = 'verified-first';
        assert.strictEqual(getRepoResolutionMode(), 'legacy');
        assert.strictEqual(pickRepoBindingOwner([SQUATTER, VICTIM], 'victim-org/public-app').id, SQUATTER.id);
    });
});

test('repo binding mode', async (t) => {
    const prev = process.env.PROJECT_REPO_BINDING_MODE;
    const prevMock = process.env.MOCK_DB;
    t.after(() => {
        if (prev === undefined) delete process.env.PROJECT_REPO_BINDING_MODE;
        else process.env.PROJECT_REPO_BINDING_MODE = prev;
        if (prevMock === undefined) delete process.env.MOCK_DB;
        else process.env.MOCK_DB = prevMock;
    });

    await t.test('defaults to warn - records evidence, blocks nobody', () => {
        delete process.env.MOCK_DB;
        delete process.env.PROJECT_REPO_BINDING_MODE;
        assert.strictEqual(getRepoBindingMode(), 'warn');
    });

    await t.test('MOCK_DB forces off', () => {
        process.env.MOCK_DB = 'true';
        process.env.PROJECT_REPO_BINDING_MODE = 'enforce';
        assert.strictEqual(getRepoBindingMode(), 'off');
    });

    await t.test('garbage values fall back to the default rather than throwing', () => {
        delete process.env.MOCK_DB;
        process.env.PROJECT_REPO_BINDING_MODE = 'yes-please';
        assert.strictEqual(getRepoBindingMode(), 'warn');
    });
});

test('verification evidence', async (t) => {
    await t.test('a created webhook proves admin', () => {
        assert.strictEqual(buildRepoVerification(12345, undefined).level, 'admin');
        assert.strictEqual(buildRepoVerification(12345, undefined).webhookId, 12345);
    });

    await t.test('read-only access is unverified and stores null, never undefined', () => {
        const v = buildRepoVerification(null, false);
        assert.strictEqual(v.level, 'unverified');
        assert.strictEqual(v.webhookId, null);
        assert.ok(v.verifiedAt instanceof Date);
    });

    await t.test('permissions.admin alone is enough (hook already existed)', () => {
        assert.strictEqual(buildRepoVerification(null, true).level, 'admin');
    });

    await t.test('422 from createWebhook means the hook exists, so the caller is an admin', () => {
        assert.strictEqual(isWebhookAlreadyExistsError({ status: 422 }), true);
        assert.strictEqual(isWebhookAlreadyExistsError({ status: 404 }), false);
        assert.strictEqual(isWebhookAlreadyExistsError(null), false);
        assert.strictEqual(isWebhookAlreadyExistsError(new Error('boom')), false);
    });
});

test('repoOwnerKey', () => {
    assert.strictEqual(repoOwnerKey({ userId: 'u1', teamId: null }), 'user:u1');
    assert.strictEqual(repoOwnerKey({ userId: 'u1', teamId: 'team_9' }), 'team:team_9');
    assert.strictEqual(repoOwnerKey({ userId: 'u1' }), 'user:u1');
    assert.strictEqual(repoOwnerKey(undefined), 'user:unknown');
});
