import { test } from 'node:test';
import assert from 'node:assert';
import {
    INSTANCE_CAPS,
    decideInstanceLimits,
    effectiveBounds,
    getInstanceCaps,
    isNonIncreasing,
} from './compute-gate';
import {
    clampInstanceBounds,
    getComputeLimitMode,
    getInstanceCeilings,
} from '@/lib/gcp/instance-limits';
import { TIERS } from './tiers';

const FREE = INSTANCE_CAPS.free;

test('COMPUTE_LIMIT_MODE parsing defaults to audit', async (t) => {
    const prev = process.env.COMPUTE_LIMIT_MODE;
    t.after(() => {
        if (prev === undefined) delete process.env.COMPUTE_LIMIT_MODE;
        else process.env.COMPUTE_LIMIT_MODE = prev;
    });

    delete process.env.COMPUTE_LIMIT_MODE;
    assert.strictEqual(getComputeLimitMode(), 'audit');
    process.env.COMPUTE_LIMIT_MODE = 'nonsense';
    assert.strictEqual(getComputeLimitMode(), 'audit');
    process.env.COMPUTE_LIMIT_MODE = ' Enforce ';
    assert.strictEqual(getComputeLimitMode(), 'enforce');
    process.env.COMPUTE_LIMIT_MODE = 'OFF';
    assert.strictEqual(getComputeLimitMode(), 'off');
});

test('the abusive body from the report is rejected in enforce mode', () => {
    // {"resources":{"cpu":4,"memory":"4Gi","minInstances":1000,"maxInstances":1000}}
    const decision = decideInstanceLimits(
        'enforce',
        { cpu: 4, memory: '4Gi', minInstances: 1000, maxInstances: 1000 },
        undefined,
        FREE
    );
    assert.strictEqual(decision.blocked, true);
    assert.strictEqual(decision.violation, 'minInstances');
    assert.strictEqual(decision.status, 403);
});

test('always-on vCPU is capped even when the instance count looks small', () => {
    // 1 instance is within free's minInstances cap, but 1 x 4 vCPU is not free.
    const decision = decideInstanceLimits('enforce', { cpu: 4, minInstances: 1 }, undefined, FREE);
    assert.strictEqual(decision.violation, 'alwaysOnVcpu');
    assert.strictEqual(decision.blocked, true);
});

test('nothing is ever blocked outside enforce mode', () => {
    // Regression guard for "kuch break na ho": with the flag unset (audit) the route
    // must behave exactly as it does today.
    const abusive = { cpu: 4, minInstances: 1000, maxInstances: 1000 };
    assert.strictEqual(decideInstanceLimits('audit', abusive, undefined, FREE).blocked, false);
    assert.strictEqual(decideInstanceLimits('off', abusive, undefined, FREE).blocked, false);
    // ...but audit still reports, so operators can size the blast radius.
    assert.strictEqual(decideInstanceLimits('audit', abusive, undefined, FREE).violation, 'minInstances');
    assert.strictEqual(decideInstanceLimits('off', abusive, undefined, FREE).violation, undefined);
});

test('every value the dashboard defaults to passes even in enforce mode', () => {
    // ResourceSettings.tsx defaults: cpu 1, 512Mi, min 0, max 10.
    const fromUi = { cpu: 1, memory: '512Mi', minInstances: 0, maxInstances: 10 };
    assert.strictEqual(decideInstanceLimits('enforce', fromUi, undefined, FREE).violation, undefined);
    // ...and so does every CPU option at the default instance counts.
    for (const cpu of [1, 2, 4]) {
        const decision = decideInstanceLimits('enforce', { cpu, minInstances: 0, maxInstances: 10 }, undefined, FREE);
        assert.strictEqual(decision.violation, undefined, `cpu=${cpu} must pass`);
    }
});

test('a tenant already above the cap can still save and still scale down', () => {
    // Legacy project written before this gate existed.
    const stored = { cpu: 4, memory: '4Gi', minInstances: 25, maxInstances: 60 };

    // ResourceSettings.tsx re-submits all four fields on every save: a memory-only edit
    // must not start failing.
    const resubmit = { cpu: 4, memory: '2Gi', minInstances: 25, maxInstances: 60 };
    assert.strictEqual(decideInstanceLimits('enforce', resubmit, stored, FREE).violation, undefined);

    // Scaling down is always allowed.
    const scaleDown = { cpu: 4, memory: '4Gi', minInstances: 10, maxInstances: 30 };
    assert.strictEqual(decideInstanceLimits('enforce', scaleDown, stored, FREE).violation, undefined);
    assert.strictEqual(isNonIncreasing(scaleDown, stored), true);

    // Going further up is not.
    const scaleUp = { cpu: 4, memory: '4Gi', minInstances: 26, maxInstances: 60 };
    assert.strictEqual(decideInstanceLimits('enforce', scaleUp, stored, FREE).violation, 'minInstances');
    assert.strictEqual(isNonIncreasing(scaleUp, stored), false);
});

test('effectiveBounds mirrors the fallbacks in cloudbuild.ts', () => {
    // updateProject() replaces the whole `resources` map, so an omitted field really does
    // fall back to the config default the deploy step uses.
    assert.deepStrictEqual(effectiveBounds(undefined), { min: 0, max: 10, cpu: 1 });
    assert.deepStrictEqual(effectiveBounds({}), { min: 0, max: 10, cpu: 1 });
    // Strings reach Firestore as-is today (the route never coerces minInstances).
    assert.deepStrictEqual(effectiveBounds({ minInstances: '3', cpu: '2' }), { min: 3, max: 10, cpu: 2 });
    // Garbage is never treated as a violation; the existing NaN checks already 400.
    assert.deepStrictEqual(effectiveBounds({ minInstances: 'abc' }), { min: 0, max: 10, cpu: 1 });
});

test('higher plans get higher caps, enterprise is unbounded', () => {
    const abusive = { cpu: 4, minInstances: 1000, maxInstances: 1000 };
    assert.strictEqual(decideInstanceLimits('enforce', abusive, undefined, getInstanceCaps(TIERS.enterprise)).violation, undefined);
    assert.strictEqual(decideInstanceLimits('enforce', { cpu: 1, minInstances: 4, maxInstances: 40 }, undefined, getInstanceCaps(TIERS.pro)).violation, undefined);
    assert.strictEqual(decideInstanceLimits('enforce', { cpu: 1, minInstances: 4, maxInstances: 40 }, undefined, FREE).violation, 'minInstances');
});

test('per-plan env override raises a cap without a deploy', async (t) => {
    const prev = process.env.COMPUTE_MAX_INSTANCES_CAP_FREE;
    t.after(() => {
        if (prev === undefined) delete process.env.COMPUTE_MAX_INSTANCES_CAP_FREE;
        else process.env.COMPUTE_MAX_INSTANCES_CAP_FREE = prev;
    });

    process.env.COMPUTE_MAX_INSTANCES_CAP_FREE = '40';
    assert.strictEqual(getInstanceCaps(TIERS.free).maxInstances, 40);
    assert.strictEqual(
        decideInstanceLimits('enforce', { minInstances: 0, maxInstances: 40 }, undefined, getInstanceCaps(TIERS.free)).violation,
        undefined
    );
});

test('deploy-time clamp is a no-op unless enforcing, and never inverts min/max', () => {
    const ceilings = getInstanceCeilings();
    assert.deepStrictEqual(ceilings, { min: 10, max: 100 });

    // audit/off: byte-for-byte the argv cloudbuild.ts produces today.
    assert.deepStrictEqual(
        clampInstanceBounds(1000, 1000, 'audit', ceilings, 'test'),
        { min: 1000, max: 1000, clamped: false }
    );
    assert.deepStrictEqual(
        clampInstanceBounds(1000, 1000, 'off', ceilings, 'test'),
        { min: 1000, max: 1000, clamped: false }
    );

    // enforce: lowered, never raised, and max stays >= min.
    const clamped = clampInstanceBounds(1000, 1000, 'enforce', ceilings, 'test');
    assert.deepStrictEqual(clamped, { min: 10, max: 100, clamped: true });
    assert.strictEqual(Number(clamped.min) <= Number(clamped.max), true);

    // In-range values are returned untouched in every mode, including the config defaults.
    assert.deepStrictEqual(clampInstanceBounds(0, 10, 'enforce', ceilings, 'test'), { min: 0, max: 10, clamped: false });

    // A non-numeric value keeps flowing through exactly as it does today.
    assert.deepStrictEqual(
        clampInstanceBounds('abc', 'abc', 'enforce', ceilings, 'test'),
        { min: 'abc', max: 'abc', clamped: false }
    );

    // Misconfigured ceilings (min > max) must not produce min > max.
    const inverted = clampInstanceBounds(500, 500, 'enforce', { min: 50, max: 20 }, 'test');
    assert.strictEqual(Number(inverted.min) <= Number(inverted.max), true);
});
