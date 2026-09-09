import { test } from 'node:test';
import assert from 'node:assert';
import {
    AUDIT_PROBE_INTERVAL_MS,
    decideGitDeployCap,
    getWebhookUsageCapMode,
    isUnlimitedTier,
    shouldRunAuditProbe,
    usageCapMessage,
} from './deploy-gate';
import { TIERS } from './tiers';
import type { CheckLimitResult } from './caps';

const OVER: CheckLimitResult = { withinLimits: false, usagePercentage: 340, limitType: 'deployments' };
const UNDER: CheckLimitResult = { withinLimits: true, usagePercentage: 12, limitType: undefined };

test('WEBHOOK_USAGE_CAP_MODE parsing', async (t) => {
    const prev = process.env.WEBHOOK_USAGE_CAP_MODE;
    t.after(() => {
        if (prev === undefined) delete process.env.WEBHOOK_USAGE_CAP_MODE;
        else process.env.WEBHOOK_USAGE_CAP_MODE = prev;
    });

    await t.test('defaults to audit (no enforcement, today behaviour)', () => {
        delete process.env.WEBHOOK_USAGE_CAP_MODE;
        assert.strictEqual(getWebhookUsageCapMode(), 'audit');
        process.env.WEBHOOK_USAGE_CAP_MODE = '';
        assert.strictEqual(getWebhookUsageCapMode(), 'audit');
        process.env.WEBHOOK_USAGE_CAP_MODE = 'nonsense';
        assert.strictEqual(getWebhookUsageCapMode(), 'audit');
    });

    await t.test('accepts off and enforce, case/space insensitive', () => {
        process.env.WEBHOOK_USAGE_CAP_MODE = ' OFF ';
        assert.strictEqual(getWebhookUsageCapMode(), 'off');
        process.env.WEBHOOK_USAGE_CAP_MODE = 'Enforce';
        assert.strictEqual(getWebhookUsageCapMode(), 'enforce');
    });
});

test('decideGitDeployCap never blocks except in enforce mode', () => {
    // This is the regression guard for "kuch break na ho": with the flag unset the
    // webhook must behave exactly as it does today.
    assert.strictEqual(decideGitDeployCap('off', TIERS.free, OVER).blocked, false);
    assert.strictEqual(decideGitDeployCap('audit', TIERS.free, OVER).blocked, false);
    assert.strictEqual(decideGitDeployCap('enforce', TIERS.free, OVER).blocked, true);
});

test('decideGitDeployCap fails open when the usage lookup fails', () => {
    assert.strictEqual(decideGitDeployCap('enforce', TIERS.free, null).blocked, false);
});

test('decideGitDeployCap allows tenants inside their limits', () => {
    assert.strictEqual(decideGitDeployCap('enforce', TIERS.free, UNDER).blocked, false);
    assert.strictEqual(decideGitDeployCap('enforce', TIERS.pro, UNDER).blocked, false);
});

test('unlimited tiers are never blocked, even on a stale over-limit reading', () => {
    assert.strictEqual(isUnlimitedTier(TIERS.enterprise), true);
    assert.strictEqual(isUnlimitedTier(TIERS.free), false);
    assert.strictEqual(isUnlimitedTier(TIERS.team), false);
    assert.strictEqual(decideGitDeployCap('enforce', TIERS.enterprise, OVER).blocked, false);
});

test('audit probes are throttled per project so a busy repo cannot hammer billing', () => {
    const t0 = 1_000_000;
    assert.strictEqual(shouldRunAuditProbe('proj_busy', t0), true);
    assert.strictEqual(shouldRunAuditProbe('proj_busy', t0 + 1), false);
    assert.strictEqual(shouldRunAuditProbe('proj_busy', t0 + AUDIT_PROBE_INTERVAL_MS - 1), false);
    // A different project is tracked independently.
    assert.strictEqual(shouldRunAuditProbe('proj_other', t0 + 1), true);
    // The window reopens.
    assert.strictEqual(shouldRunAuditProbe('proj_busy', t0 + AUDIT_PROBE_INTERVAL_MS), true);
});

test('blocked decisions carry the exact message the manual /deploy route returns', () => {
    const decision = decideGitDeployCap('enforce', TIERS.free, OVER);
    assert.strictEqual(decision.limitType, 'deployments');
    assert.strictEqual(decision.message, 'Usage limit exceeded: deployments. Please upgrade your plan.');
    assert.strictEqual(usageCapMessage('buildMinutes'), 'Usage limit exceeded: buildMinutes. Please upgrade your plan.');
});
