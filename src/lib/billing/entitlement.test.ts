import { test } from 'node:test';
import assert from 'node:assert';
import {
    evaluateEntitlement,
    getEntitlementGraceMs,
    getEntitlementMode,
    resolveEffectiveTierId,
    resolvePeriodEnd,
    toDateOrNull,
    type SubscriptionLike,
} from './entitlement';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-09T12:00:00.000Z');
const NO_GRACE = 0;

function paid(overrides: Partial<SubscriptionLike> = {}): SubscriptionLike {
    return { tier: 'pro', status: 'active', ...overrides };
}

test('BILLING_ENTITLEMENT_MODE parsing', async (t) => {
    const prevMode = process.env.BILLING_ENTITLEMENT_MODE;
    const prevMock = process.env.MOCK_DB;
    t.after(() => {
        if (prevMode === undefined) delete process.env.BILLING_ENTITLEMENT_MODE;
        else process.env.BILLING_ENTITLEMENT_MODE = prevMode;
        if (prevMock === undefined) delete process.env.MOCK_DB;
        else process.env.MOCK_DB = prevMock;
    });

    await t.test('defaults to audit (no enforcement, today behaviour)', () => {
        delete process.env.MOCK_DB;
        delete process.env.BILLING_ENTITLEMENT_MODE;
        assert.strictEqual(getEntitlementMode(), 'audit');
        process.env.BILLING_ENTITLEMENT_MODE = '';
        assert.strictEqual(getEntitlementMode(), 'audit');
        process.env.BILLING_ENTITLEMENT_MODE = 'nonsense';
        assert.strictEqual(getEntitlementMode(), 'audit');
    });

    await t.test('accepts off and enforce, case/space insensitive', () => {
        delete process.env.MOCK_DB;
        process.env.BILLING_ENTITLEMENT_MODE = ' OFF ';
        assert.strictEqual(getEntitlementMode(), 'off');
        process.env.BILLING_ENTITLEMENT_MODE = 'Enforce';
        assert.strictEqual(getEntitlementMode(), 'enforce');
    });

    await t.test('MOCK_DB local dev is always off', () => {
        process.env.MOCK_DB = 'true';
        process.env.BILLING_ENTITLEMENT_MODE = 'enforce';
        assert.strictEqual(getEntitlementMode(), 'off');
    });
});

test('grace window parsing', (t) => {
    const prev = process.env.BILLING_ENTITLEMENT_GRACE_DAYS;
    t.after(() => {
        if (prev === undefined) delete process.env.BILLING_ENTITLEMENT_GRACE_DAYS;
        else process.env.BILLING_ENTITLEMENT_GRACE_DAYS = prev;
    });

    delete process.env.BILLING_ENTITLEMENT_GRACE_DAYS;
    assert.strictEqual(getEntitlementGraceMs(), 3 * DAY);
    process.env.BILLING_ENTITLEMENT_GRACE_DAYS = 'abc';
    assert.strictEqual(getEntitlementGraceMs(), 3 * DAY);
    process.env.BILLING_ENTITLEMENT_GRACE_DAYS = '-5';
    assert.strictEqual(getEntitlementGraceMs(), 3 * DAY);
    process.env.BILLING_ENTITLEMENT_GRACE_DAYS = '0';
    assert.strictEqual(getEntitlementGraceMs(), 0);
    process.env.BILLING_ENTITLEMENT_GRACE_DAYS = '10';
    assert.strictEqual(getEntitlementGraceMs(), 10 * DAY);
    process.env.BILLING_ENTITLEMENT_GRACE_DAYS = '9999';
    assert.strictEqual(getEntitlementGraceMs(), 90 * DAY);
});

test('toDateOrNull accepts every encoding a subscription date arrives in', () => {
    const iso = '2026-09-01T00:00:00.000Z';
    const expected = new Date(iso).getTime();

    assert.strictEqual(toDateOrNull(new Date(iso))?.getTime(), expected);
    // Firestore Timestamp instance - getUserById() does NOT convert currentPeriodEnd.
    assert.strictEqual(toDateOrNull({ toDate: () => new Date(iso) })?.getTime(), expected);
    // Timestamp round-tripped through JSON (session JWT).
    assert.strictEqual(toDateOrNull({ _seconds: expected / 1000, _nanoseconds: 0 })?.getTime(), expected);
    assert.strictEqual(toDateOrNull({ seconds: expected / 1000 })?.getTime(), expected);
    // Date round-tripped through JSON.
    assert.strictEqual(toDateOrNull(iso)?.getTime(), expected);
    assert.strictEqual(toDateOrNull(expected)?.getTime(), expected);
    assert.strictEqual(toDateOrNull(expected / 1000)?.getTime(), expected);

    // Anything unusable is null, which is always the permissive answer.
    assert.strictEqual(toDateOrNull(undefined), null);
    assert.strictEqual(toDateOrNull(null), null);
    assert.strictEqual(toDateOrNull(''), null);
    assert.strictEqual(toDateOrNull('not a date'), null);
    assert.strictEqual(toDateOrNull(new Date('nope')), null);
    assert.strictEqual(toDateOrNull({}), null);
    assert.strictEqual(toDateOrNull({ toDate: () => { throw new Error('boom'); } }), null);
});

test('resolvePeriodEnd dual-reads currentPeriodEnd and expiresAt, later one wins', () => {
    const early = new Date(NOW.getTime() - 10 * DAY);
    const late = new Date(NOW.getTime() + 10 * DAY);

    assert.strictEqual(resolvePeriodEnd(undefined), null);
    assert.strictEqual(resolvePeriodEnd({ tier: 'pro' }), null);
    assert.strictEqual(resolvePeriodEnd({ currentPeriodEnd: late })?.getTime(), late.getTime());
    assert.strictEqual(resolvePeriodEnd({ expiresAt: late })?.getTime(), late.getTime());
    assert.strictEqual(
        resolvePeriodEnd({ currentPeriodEnd: early, expiresAt: late })?.getTime(),
        late.getTime()
    );
    assert.strictEqual(
        resolvePeriodEnd({ currentPeriodEnd: late, expiresAt: early })?.getTime(),
        late.getTime()
    );
});

test('THE BUG: a 30-day currentPeriodEnd in the past now lapses', () => {
    // Exactly what /api/billing/verify and /api/billing/webhook write, 40 days ago.
    const sub = paid({ currentPeriodEnd: new Date(NOW.getTime() - 40 * DAY) });

    const audited = evaluateEntitlement(sub, 'audit', NOW, NO_GRACE);
    assert.strictEqual(audited.lapsed, true);
    assert.strictEqual(audited.reason, 'period_ended');
    // ...but audit mode must not change the answer.
    assert.strictEqual(audited.effectiveTier, 'pro');

    const enforced = evaluateEntitlement(sub, 'enforce', NOW, NO_GRACE);
    assert.strictEqual(enforced.lapsed, true);
    assert.strictEqual(enforced.effectiveTier, 'free');
});

test('a Firestore Timestamp currentPeriodEnd lapses too (getUserById leaves it raw)', () => {
    const past = new Date(NOW.getTime() - 40 * DAY);
    const sub = paid({ currentPeriodEnd: { toDate: () => past } });
    assert.strictEqual(evaluateEntitlement(sub, 'enforce', NOW, NO_GRACE).effectiveTier, 'free');
});

test('off/audit mode never downgrades anyone - the "kuch break na ho" guard', () => {
    const long_gone = paid({ tier: 'enterprise', currentPeriodEnd: new Date(NOW.getTime() - 400 * DAY) });
    assert.strictEqual(evaluateEntitlement(long_gone, 'off', NOW, NO_GRACE).effectiveTier, 'enterprise');
    assert.strictEqual(evaluateEntitlement(long_gone, 'audit', NOW, NO_GRACE).effectiveTier, 'enterprise');
});

test('enforce mode leaves every subscription without a usable end date alone', () => {
    // Legacy docs, hand-granted plans, and anything written before currentPeriodEnd
    // existed. These must keep their tier forever - there is no evidence they lapsed.
    for (const sub of [
        paid(),
        paid({ tier: 'enterprise' }),
        paid({ currentPeriodEnd: undefined, expiresAt: undefined }),
        paid({ currentPeriodEnd: 'garbage' }),
        paid({ currentPeriodEnd: {} }),
        paid({ status: 'canceled' }),
    ]) {
        const decision = evaluateEntitlement(sub, 'enforce', NOW, NO_GRACE);
        assert.strictEqual(decision.lapsed, false, JSON.stringify(sub));
        assert.strictEqual(decision.effectiveTier, sub.tier);
    }
});

test('enforce mode leaves current subscriptions and free users alone', () => {
    const current = paid({ currentPeriodEnd: new Date(NOW.getTime() + 5 * DAY) });
    assert.strictEqual(evaluateEntitlement(current, 'enforce', NOW, NO_GRACE).effectiveTier, 'pro');

    const freeUser = { tier: 'free', currentPeriodEnd: new Date(NOW.getTime() - 400 * DAY) };
    const decision = evaluateEntitlement(freeUser, 'enforce', NOW, NO_GRACE);
    assert.strictEqual(decision.lapsed, false);
    assert.strictEqual(decision.effectiveTier, 'free');

    assert.strictEqual(evaluateEntitlement(undefined, 'enforce', NOW, NO_GRACE).effectiveTier, 'free');
});

test('the grace window protects a tenant whose renewal webhook is late', () => {
    const oneDayLate = paid({ currentPeriodEnd: new Date(NOW.getTime() - 1 * DAY) });
    assert.strictEqual(evaluateEntitlement(oneDayLate, 'enforce', NOW, 3 * DAY).effectiveTier, 'pro');

    const fourDaysLate = paid({ currentPeriodEnd: new Date(NOW.getTime() - 4 * DAY) });
    assert.strictEqual(evaluateEntitlement(fourDaysLate, 'enforce', NOW, 3 * DAY).effectiveTier, 'free');
});

test('cancellation runs to the end of the paid period, then revokes without grace', () => {
    const canceledMidCycle = paid({ status: 'canceled', currentPeriodEnd: new Date(NOW.getTime() + 5 * DAY) });
    const midCycle = evaluateEntitlement(canceledMidCycle, 'enforce', NOW, 3 * DAY);
    assert.strictEqual(midCycle.lapsed, false);
    assert.strictEqual(midCycle.effectiveTier, 'pro');

    // Grace exists for a renewal that might still land. A cancelled plan has none.
    const canceledYesterday = paid({ status: 'canceled', currentPeriodEnd: new Date(NOW.getTime() - 1 * DAY) });
    const after = evaluateEntitlement(canceledYesterday, 'enforce', NOW, 3 * DAY);
    assert.strictEqual(after.effectiveTier, 'free');
    assert.strictEqual(after.reason, 'canceled');

    const unpaid = paid({ status: 'unpaid', currentPeriodEnd: new Date(NOW.getTime() - 1 * DAY) });
    assert.strictEqual(evaluateEntitlement(unpaid, 'enforce', NOW, 3 * DAY).reason, 'unpaid');

    // past_due is a dunning state, not a revocation: it still gets the grace window.
    const pastDue = paid({ status: 'past_due', currentPeriodEnd: new Date(NOW.getTime() - 1 * DAY) });
    assert.strictEqual(evaluateEntitlement(pastDue, 'enforce', NOW, 3 * DAY).effectiveTier, 'pro');
});

test('resolveEffectiveTierId honours the env flag and never throws', (t) => {
    const prevMode = process.env.BILLING_ENTITLEMENT_MODE;
    const prevMock = process.env.MOCK_DB;
    const prevGrace = process.env.BILLING_ENTITLEMENT_GRACE_DAYS;
    t.after(() => {
        if (prevMode === undefined) delete process.env.BILLING_ENTITLEMENT_MODE;
        else process.env.BILLING_ENTITLEMENT_MODE = prevMode;
        if (prevMock === undefined) delete process.env.MOCK_DB;
        else process.env.MOCK_DB = prevMock;
        if (prevGrace === undefined) delete process.env.BILLING_ENTITLEMENT_GRACE_DAYS;
        else process.env.BILLING_ENTITLEMENT_GRACE_DAYS = prevGrace;
    });

    delete process.env.MOCK_DB;
    process.env.BILLING_ENTITLEMENT_GRACE_DAYS = '0';
    const lapsed = paid({ currentPeriodEnd: new Date(Date.now() - 40 * DAY) });

    delete process.env.BILLING_ENTITLEMENT_MODE;
    assert.strictEqual(resolveEffectiveTierId(lapsed, 'u1'), 'pro');

    process.env.BILLING_ENTITLEMENT_MODE = 'off';
    assert.strictEqual(resolveEffectiveTierId(lapsed, 'u1'), 'pro');

    process.env.BILLING_ENTITLEMENT_MODE = 'enforce';
    assert.strictEqual(resolveEffectiveTierId(lapsed, 'u1'), 'free');
    assert.strictEqual(resolveEffectiveTierId(undefined, 'u1'), 'free');
    assert.strictEqual(resolveEffectiveTierId({ tier: 'team' }, 'u1'), 'team');
});
