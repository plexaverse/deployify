import { test } from 'node:test';
import assert from 'node:assert';
import { calculateEfficiencyScore, detectPlanDrift } from './monitoring';

test('calculateEfficiencyScore', () => {
    // Healthy utilization
    const score1 = calculateEfficiencyScore({ cpuUtilization: 60, memoryUtilization: 60, timestamp: '' }, 100);
    assert.ok(score1 > 80, `Expected high score for healthy utilization, got ${score1}`);

    // Low utilization (over-provisioned)
    const score2 = calculateEfficiencyScore({ cpuUtilization: 5, memoryUtilization: 10, timestamp: '' }, 500);
    assert.ok(score2 < 50, `Expected low score for low utilization, got ${score2}`);

    // Free tier
    const score3 = calculateEfficiencyScore({ cpuUtilization: 5, memoryUtilization: 5, timestamp: '' }, 0);
    assert.strictEqual(score3, 100, 'Free tier should always have 100 efficiency');
});

test('detectPlanDrift', () => {
    const currentPlan = [{ 'QUERY PLAN': 'Seq Scan on users  (cost=0.00..34.50 rows=1250 width=112)' }];
    const historicalPlans = [
        [{ 'QUERY PLAN': 'Index Scan using users_pkey on users  (cost=0.28..8.29 rows=1 width=112)' }],
        [{ 'QUERY PLAN': 'Index Scan using users_pkey on users  (cost=0.28..8.29 rows=1 width=112)' }]
    ];

    const result = detectPlanDrift(currentPlan, historicalPlans);
    assert.strictEqual(result.drifted, true);
    assert.strictEqual(result.impact, 'high');
    assert.ok(result.reason?.includes('Sequential Scan'));

    const healthyPlan = [{ 'QUERY PLAN': 'Index Scan using users_pkey on users  (cost=0.28..8.29 rows=1 width=112)' }];
    const result2 = detectPlanDrift(healthyPlan, historicalPlans);
    assert.strictEqual(result2.drifted, false);
});
