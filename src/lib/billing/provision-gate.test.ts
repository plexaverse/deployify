import { test } from 'node:test';
import assert from 'node:assert';
import {
    CLOUD_SQL_TIER_ALLOWLIST,
    countProvisionedInstances,
    decideCloudSqlTier,
    decideHighAvailability,
    decideProvisionQuota,
    getCloudSqlTierAllowlist,
    getHighAvailabilityMinPlan,
    getProvisionGateMode,
    getProvisionQuota,
} from './provision-gate';
import { TIERS } from './tiers';
import type { Project } from '@/types';

const ALLOWLIST = new Set(CLOUD_SQL_TIER_ALLOWLIST);

test('STORAGE_PROVISION_GATE_MODE parsing defaults to audit', async (t) => {
    const prev = process.env.STORAGE_PROVISION_GATE_MODE;
    t.after(() => {
        if (prev === undefined) delete process.env.STORAGE_PROVISION_GATE_MODE;
        else process.env.STORAGE_PROVISION_GATE_MODE = prev;
    });

    delete process.env.STORAGE_PROVISION_GATE_MODE;
    assert.strictEqual(getProvisionGateMode(), 'audit');
    process.env.STORAGE_PROVISION_GATE_MODE = 'nonsense';
    assert.strictEqual(getProvisionGateMode(), 'audit');
    process.env.STORAGE_PROVISION_GATE_MODE = ' Enforce ';
    assert.strictEqual(getProvisionGateMode(), 'enforce');
    process.env.STORAGE_PROVISION_GATE_MODE = 'OFF';
    assert.strictEqual(getProvisionGateMode(), 'off');
});

test('the abusive tier from the report is rejected in enforce mode', () => {
    const decision = decideCloudSqlTier('enforce', 'db-custom-96-624000', undefined, ALLOWLIST);
    assert.strictEqual(decision.blocked, true);
    assert.strictEqual(decision.violation, 'tier');
    assert.strictEqual(decision.status, 400);
});

test('nothing is ever blocked outside enforce mode', () => {
    // Regression guard for "kuch break na ho": with the flag unset (audit) the route
    // must behave exactly as it does today.
    assert.strictEqual(decideCloudSqlTier('audit', 'db-custom-96-624000', undefined, ALLOWLIST).blocked, false);
    assert.strictEqual(decideCloudSqlTier('off', 'db-custom-96-624000', undefined, ALLOWLIST).blocked, false);
    assert.strictEqual(decideProvisionQuota('audit', TIERS.free, 999, 3).blocked, false);
    assert.strictEqual(decideProvisionQuota('off', TIERS.free, 999, 3).blocked, false);
    assert.strictEqual(decideHighAvailability('audit', true, TIERS.free, 'team').blocked, false);
    // ...but audit still reports, so operators can size the blast radius.
    assert.strictEqual(decideCloudSqlTier('audit', 'db-custom-96-624000', undefined, ALLOWLIST).violation, 'tier');
    assert.strictEqual(decideCloudSqlTier('off', 'db-custom-96-624000', undefined, ALLOWLIST).violation, undefined);
});

test('every tier the dashboard can send passes even in enforce mode', () => {
    // Exact union of the <option> values in src/components/StorageSection.tsx.
    const fromUi = [
        'db-f1-micro', 'db-g1-small', 'db-custom-1-3840',
        'db-custom-2-7680', 'db-custom-4-15360', 'db-custom-8-30720',
    ];
    for (const tier of fromUi) {
        assert.strictEqual(
            decideCloudSqlTier('enforce', tier, undefined, ALLOWLIST).blocked,
            false,
            `${tier} is offered by the UI and must not be blocked`
        );
    }
});

test('a legacy or discovered tier can always be re-submitted unchanged', () => {
    // sync/route.ts writes the real GCP tier back onto adopted instances; re-sending
    // the stored value is a no-op scale and must not start failing.
    const decision = decideCloudSqlTier('enforce', 'db-n1-standard-4', 'db-n1-standard-4', ALLOWLIST);
    assert.strictEqual(decision.blocked, false);
    // Moving that same instance to another off-list tier is still refused.
    assert.strictEqual(
        decideCloudSqlTier('enforce', 'db-n1-highmem-96', 'db-n1-standard-4', ALLOWLIST).blocked,
        true
    );
});

test('absent, empty and non-string tiers keep the historical default', () => {
    assert.strictEqual(decideCloudSqlTier('enforce', undefined, undefined, ALLOWLIST).blocked, false);
    assert.strictEqual(decideCloudSqlTier('enforce', null, undefined, ALLOWLIST).blocked, false);
    assert.strictEqual(decideCloudSqlTier('enforce', '', undefined, ALLOWLIST).blocked, false);
    assert.strictEqual(decideCloudSqlTier('enforce', { evil: true }, undefined, ALLOWLIST).blocked, true);
});

test('STORAGE_TIER_ALLOWLIST_EXTRA is an ops escape hatch', async (t) => {
    const prev = process.env.STORAGE_TIER_ALLOWLIST_EXTRA;
    t.after(() => {
        if (prev === undefined) delete process.env.STORAGE_TIER_ALLOWLIST_EXTRA;
        else process.env.STORAGE_TIER_ALLOWLIST_EXTRA = prev;
    });

    process.env.STORAGE_TIER_ALLOWLIST_EXTRA = ' db-n1-standard-4 , db-custom-16-61440 ';
    const list = getCloudSqlTierAllowlist();
    assert.strictEqual(list.has('db-n1-standard-4'), true);
    assert.strictEqual(list.has('db-custom-16-61440'), true);
    assert.strictEqual(list.has('db-custom-96-624000'), false);
});

test('quota blocks only at or above the limit, and never on a failed count', () => {
    assert.strictEqual(decideProvisionQuota('enforce', TIERS.free, 2, 3).blocked, false);
    assert.strictEqual(decideProvisionQuota('enforce', TIERS.free, 3, 3).blocked, true);
    assert.strictEqual(decideProvisionQuota('enforce', TIERS.free, 3, 3).status, 403);
    // Firestore outage -> fail open.
    assert.strictEqual(decideProvisionQuota('enforce', TIERS.free, null, 3).blocked, false);
    // Enterprise is unmetered.
    assert.strictEqual(decideProvisionQuota('enforce', TIERS.enterprise, 5000, Infinity).blocked, false);
});

test('getProvisionQuota honours per-plan env overrides', async (t) => {
    const prev = process.env.STORAGE_PROVISION_QUOTA_FREE;
    t.after(() => {
        if (prev === undefined) delete process.env.STORAGE_PROVISION_QUOTA_FREE;
        else process.env.STORAGE_PROVISION_QUOTA_FREE = prev;
    });

    delete process.env.STORAGE_PROVISION_QUOTA_FREE;
    assert.strictEqual(getProvisionQuota(TIERS.free), 3);
    process.env.STORAGE_PROVISION_QUOTA_FREE = '1';
    assert.strictEqual(getProvisionQuota(TIERS.free), 1);
    process.env.STORAGE_PROVISION_QUOTA_FREE = 'garbage';
    assert.strictEqual(getProvisionQuota(TIERS.free), 3);
    assert.strictEqual(getProvisionQuota(TIERS.enterprise), Infinity);
});

test('HA is permitted for every plan until STORAGE_HA_MIN_PLAN is raised', async (t) => {
    const prev = process.env.STORAGE_HA_MIN_PLAN;
    t.after(() => {
        if (prev === undefined) delete process.env.STORAGE_HA_MIN_PLAN;
        else process.env.STORAGE_HA_MIN_PLAN = prev;
    });

    delete process.env.STORAGE_HA_MIN_PLAN;
    assert.strictEqual(getHighAvailabilityMinPlan(), 'free');
    assert.strictEqual(decideHighAvailability('enforce', true, TIERS.free, 'free').blocked, false);

    process.env.STORAGE_HA_MIN_PLAN = 'pro';
    assert.strictEqual(getHighAvailabilityMinPlan(), 'pro');
    assert.strictEqual(decideHighAvailability('enforce', true, TIERS.free, 'pro').blocked, true);
    assert.strictEqual(decideHighAvailability('enforce', true, TIERS.pro, 'pro').blocked, false);
    assert.strictEqual(decideHighAvailability('enforce', true, TIERS.team, 'pro').blocked, false);
    // Turning HA off is never gated.
    assert.strictEqual(decideHighAvailability('enforce', false, TIERS.free, 'team').blocked, false);
    assert.strictEqual(decideHighAvailability('enforce', undefined, TIERS.free, 'team').blocked, false);
});

test('countProvisionedInstances counts only GCP-billed provisioned resources', () => {
    const projects = [
        {
            storageConfigs: [
                { id: 'a', type: 'cloud-sql-postgres', name: 'a', status: 'active', environment: 'both', metadata: { provisioned: true }, createdAt: new Date(), updatedAt: new Date() },
                { id: 'b', type: 'memorystore-redis', name: 'b', status: 'active', environment: 'both', metadata: { provisioned: true }, createdAt: new Date(), updatedAt: new Date() },
                // Connected, not provisioned by us.
                { id: 'c', type: 'cloud-sql-mysql', name: 'c', status: 'active', environment: 'both', metadata: { provisioned: false }, createdAt: new Date(), updatedAt: new Date() },
                // External provider: billed to the tenant, not to Deployify.
                { id: 'd', type: 'neon', name: 'd', status: 'active', environment: 'both', metadata: { provisioned: true }, createdAt: new Date(), updatedAt: new Date() },
                // No metadata at all (oldest documents).
                { id: 'e', type: 'cloud-sql-postgres', name: 'e', status: 'active', environment: 'both', createdAt: new Date(), updatedAt: new Date() },
            ],
        },
        { storageConfigs: undefined },
        {},
    ] as unknown as Array<Pick<Project, 'storageConfigs'>>;

    assert.strictEqual(countProvisionedInstances(projects), 2);
    assert.strictEqual(countProvisionedInstances([]), 0);
});
