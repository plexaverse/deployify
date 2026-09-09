import { test } from 'node:test';
import assert from 'node:assert';
import {
    ROTATION_FAILURE_BACKOFF_MS,
    decideRotation,
    decideRotationCleanup,
    getRotationCleanupMode,
    getStorageRotationMode,
    parseRotationPasswordName,
    rotationPasswordName,
    type RotationPassword,
} from './storage-rotation';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const SID = 'storage_abc123def';

test('flag parsing defaults to today behaviour', async (t) => {
    const prevMode = process.env.STORAGE_ROTATION_MODE;
    const prevCleanup = process.env.STORAGE_ROTATION_CLEANUP;
    const prevMock = process.env.MOCK_DB;
    t.after(() => {
        if (prevMode === undefined) delete process.env.STORAGE_ROTATION_MODE;
        else process.env.STORAGE_ROTATION_MODE = prevMode;
        if (prevCleanup === undefined) delete process.env.STORAGE_ROTATION_CLEANUP;
        else process.env.STORAGE_ROTATION_CLEANUP = prevCleanup;
        if (prevMock === undefined) delete process.env.MOCK_DB;
        else process.env.MOCK_DB = prevMock;
    });

    await t.test('rotation defaults to rotate, cleanup defaults to off', () => {
        delete process.env.MOCK_DB;
        delete process.env.STORAGE_ROTATION_MODE;
        delete process.env.STORAGE_ROTATION_CLEANUP;
        assert.strictEqual(getStorageRotationMode(), 'rotate');
        assert.strictEqual(getRotationCleanupMode(), 'off');
        process.env.STORAGE_ROTATION_MODE = 'nonsense';
        process.env.STORAGE_ROTATION_CLEANUP = 'nonsense';
        assert.strictEqual(getStorageRotationMode(), 'rotate');
        assert.strictEqual(getRotationCleanupMode(), 'off');
    });

    await t.test('accepts the documented values, case/space insensitive', () => {
        delete process.env.MOCK_DB;
        process.env.STORAGE_ROTATION_MODE = ' AUDIT ';
        assert.strictEqual(getStorageRotationMode(), 'audit');
        process.env.STORAGE_ROTATION_MODE = 'Off';
        assert.strictEqual(getStorageRotationMode(), 'off');
        process.env.STORAGE_ROTATION_CLEANUP = 'Sweep';
        assert.strictEqual(getRotationCleanupMode(), 'sweep');
    });

    await t.test('MOCK_DB never sweeps', () => {
        process.env.MOCK_DB = 'true';
        process.env.STORAGE_ROTATION_CLEANUP = 'sweep';
        assert.strictEqual(getRotationCleanupMode(), 'off');
        assert.strictEqual(getStorageRotationMode(), 'rotate');
    });
});

test('decideRotation reproduces the day-30 gate and adds a lease', async (t) => {
    await t.test('not due before 30 days - identical to sync/route.ts:446', () => {
        const g = decideRotation({ lastRotatedAtMs: NOW - 29.9 * DAY, nowMs: NOW }, 'rotate');
        assert.strictEqual(g.shouldRotate, false);
        assert.strictEqual(g.reason, 'not-due');
    });

    await t.test('due at exactly 30 days', () => {
        const g = decideRotation({ lastRotatedAtMs: NOW - 30 * DAY, nowMs: NOW }, 'rotate');
        assert.strictEqual(g.shouldRotate, true);
        assert.strictEqual(g.reason, 'due');
    });

    await t.test('a live lease blocks the overlapping poll', () => {
        const g = decideRotation(
            { lastRotatedAtMs: NOW - 40 * DAY, leaseUntilMs: NOW + 60_000, nowMs: NOW },
            'rotate'
        );
        assert.strictEqual(g.shouldRotate, false);
        assert.strictEqual(g.reason, 'leased');
    });

    await t.test('an expired lease does not block - a crashed request self-heals', () => {
        const g = decideRotation(
            { lastRotatedAtMs: NOW - 40 * DAY, leaseUntilMs: NOW - 1, nowMs: NOW },
            'rotate'
        );
        assert.strictEqual(g.shouldRotate, true);
    });

    await t.test('failure backoff caps orphan credential creation', () => {
        const inBackoff = decideRotation(
            { lastRotatedAtMs: NOW - 90 * DAY, lastFailedAtMs: NOW - 60_000, nowMs: NOW },
            'rotate'
        );
        assert.strictEqual(inBackoff.reason, 'backoff');
        const past = decideRotation(
            {
                lastRotatedAtMs: NOW - 90 * DAY,
                lastFailedAtMs: NOW - ROTATION_FAILURE_BACKOFF_MS - 1,
                nowMs: NOW,
            },
            'rotate'
        );
        assert.strictEqual(past.shouldRotate, true);
    });

    await t.test('audit is due but never calls the provider; off short-circuits', () => {
        const audit = decideRotation({ lastRotatedAtMs: NOW - 40 * DAY, nowMs: NOW }, 'audit');
        assert.strictEqual(audit.reason, 'due');
        assert.strictEqual(audit.shouldRotate, false);
        const off = decideRotation({ lastRotatedAtMs: NOW - 40 * DAY, nowMs: NOW }, 'off');
        assert.strictEqual(off.reason, 'mode-off');
        assert.strictEqual(off.shouldRotate, false);
    });

    await t.test('legacy documents with no lease/failure keys behave as before', () => {
        const g = decideRotation(
            { lastRotatedAtMs: NOW - 31 * DAY, leaseUntilMs: undefined, lastFailedAtMs: undefined, nowMs: NOW },
            'rotate'
        );
        assert.strictEqual(g.shouldRotate, true);
    });
});

test('rotation password naming round-trips and rejects legacy names', () => {
    const name = rotationPasswordName(SID, NOW);
    assert.strictEqual(name, `deployify-rotation-${SID}-${NOW}`);
    assert.ok(name.startsWith('deployify-rotation-'));
    assert.deepStrictEqual(parseRotationPasswordName(name), { storageId: SID, createdAtMs: NOW });

    // Legacy `deployify-rotation-<ts>` (external-sync.ts:566) has no owner segment.
    assert.strictEqual(parseRotationPasswordName(`deployify-rotation-${NOW}`), null);
    assert.strictEqual(parseRotationPasswordName('some-other-password'), null);
    assert.strictEqual(parseRotationPasswordName(undefined), null);
});

test('decideRotationCleanup never revokes a credential it cannot prove is dead', async (t) => {
    const old = NOW - 30 * DAY;
    const pw = (over: Partial<RotationPassword> & Pick<RotationPassword, 'id'>): RotationPassword => ({
        name: rotationPasswordName(SID, old),
        created_at: new Date(old).toISOString(),
        ...over,
    });
    const input = { storageId: SID, keepId: 'new-1', nowMs: NOW, graceMs: 7 * DAY };

    await t.test("mode 'off' deletes nothing - today's reachable behaviour", () => {
        const d = decideRotationCleanup([pw({ id: 'p1' })], input, 'off');
        assert.deepStrictEqual(d.remove, []);
    });

    await t.test("mode 'audit' reports but deletes nothing", () => {
        const d = decideRotationCleanup([pw({ id: 'p1' })], input, 'audit');
        assert.deepStrictEqual(d.remove, []);
    });

    await t.test('sweep deletes only this connector own, aged-out passwords', () => {
        const d = decideRotationCleanup(
            [
                pw({ id: 'new-1' }),
                pw({ id: 'p-old' }),
                pw({ id: 'p-other', name: rotationPasswordName('storage_zzz999', old) }),
                pw({ id: 'p-legacy', name: `deployify-rotation-${old}` }),
                pw({ id: 'p-manual', name: 'ci-readonly' }),
                pw({ id: 'p-fresh', name: rotationPasswordName(SID, NOW - 60_000), created_at: new Date(NOW - 60_000).toISOString() }),
            ],
            input,
            'sweep'
        );
        assert.deepStrictEqual(d.remove.map(p => p.id), ['p-old']);
        const reason = (id: string) => d.keep.find(k => k.id === id)?.reason;
        assert.strictEqual(reason('new-1'), 'just-created');
        assert.strictEqual(reason('p-other'), 'other-connector');
        assert.strictEqual(reason('p-legacy'), 'legacy-unscoped-name');
        assert.strictEqual(reason('p-manual'), 'not-deployify-managed');
        assert.strictEqual(reason('p-fresh'), 'within-grace-window');
    });

    await t.test('a username still present in the live secret is never revoked', () => {
        const d = decideRotationCleanup(
            [pw({ id: 'p-live', username: 'abc123xyz' })],
            { ...input, liveConnectionString: 'mysql://abc123xyz:pscale_pw@host/db' },
            'sweep'
        );
        assert.deepStrictEqual(d.remove, []);
        assert.strictEqual(d.keep[0].reason, 'live-in-secret-manager');
    });

    await t.test('an unparseable creation time keeps the password', () => {
        const d = decideRotationCleanup(
            [{ id: 'p-x', name: `deployify-rotation-${SID}-notanumber`, created_at: 'garbage' }],
            input,
            'sweep'
        );
        assert.deepStrictEqual(d.remove, []);
        assert.strictEqual(d.keep[0].reason, 'legacy-unscoped-name');
    });

    await t.test('empty and malformed provider payloads are inert', () => {
        assert.deepStrictEqual(decideRotationCleanup([], input, 'sweep').remove, []);
        assert.deepStrictEqual(
            decideRotationCleanup([{ id: '' } as RotationPassword], input, 'sweep').remove,
            []
        );
    });
});
