
import { TIERS, getTierLimits } from '../../src/lib/billing/tiers';
import { calculateLimitStatus } from '../../src/lib/billing/caps';
import { getProductionServiceName, getPreviewServiceName } from '../../src/lib/gcp/cloudrun';
import * as assert from 'assert';

console.log('Verifying Billing & Usage Logic...');

// Test 1: Service Naming
console.log('Testing Service Naming...');
const slug = 'test-project';
const pr = 123;
assert.strictEqual(getProductionServiceName(slug), 'dfy-test-project', 'Production service name mismatch');
assert.strictEqual(getPreviewServiceName(slug, pr), 'dfy-test-project-pr-123', 'Preview service name mismatch');
console.log('✅ Service Naming verified');

// Test 2: Tier Limits
console.log('Testing Tier Limits...');
const freeLimits = getTierLimits('free');
assert.strictEqual(freeLimits.deployments, 20, 'Free tier deployments limit incorrect');
assert.strictEqual(freeLimits.buildMinutes, 100, 'Free tier build minutes limit incorrect');
assert.strictEqual(freeLimits.bandwidth, 5, 'Free tier bandwidth limit incorrect (should be 5 GB)');

const proLimits = getTierLimits('pro');
assert.strictEqual(proLimits.deployments, 1000, 'Pro tier deployments limit incorrect');
console.log('✅ Tier Limits verified');

// Test 3: Spending Caps Logic
console.log('Testing Spending Caps Logic...');

// Case 3.1: Within limits
const result1 = calculateLimitStatus({ deployments: 10, buildMinutes: 50, bandwidth: 1024 * 1024 * 1024 }, TIERS['free']);
assert.strictEqual(result1.withinLimits, true, 'Should be within limits');
assert.strictEqual(result1.limitType, undefined, 'Should have no limit type');

// Case 3.2: Exceeded Deployments
const result2 = calculateLimitStatus({ deployments: 25, buildMinutes: 50, bandwidth: 100 }, TIERS['free']);
assert.strictEqual(result2.withinLimits, false, 'Should exceed deployment limits');
assert.strictEqual(result2.limitType, 'deployments', 'Limit type should be deployments');

// Case 3.3: Exceeded Build Minutes
const result3 = calculateLimitStatus({ deployments: 10, buildMinutes: 150, bandwidth: 100 }, TIERS['free']);
assert.strictEqual(result3.withinLimits, false, 'Should exceed build minute limits');
assert.strictEqual(result3.limitType, 'buildMinutes', 'Limit type should be buildMinutes');

// Case 3.4: Exceeded Bandwidth
const result4 = calculateLimitStatus({ deployments: 10, buildMinutes: 50, bandwidth: 6 * 1024 * 1024 * 1024 }, TIERS['free']);
assert.strictEqual(result4.withinLimits, false, 'Should exceed bandwidth limits');
assert.strictEqual(result4.limitType, 'bandwidth', 'Limit type should be bandwidth');

console.log('✅ Spending Caps Logic verified');

console.log('🎉 All Billing Logic tests passed!');
