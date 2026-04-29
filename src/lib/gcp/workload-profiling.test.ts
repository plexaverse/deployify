import { test } from 'node:test';
import assert from 'node:assert';
import { detectWorkloadProfile, detectColdStart, type ResourceMetrics } from './monitoring';
import type { ResourceDormancy } from '@/types';

test('detectColdStart', () => {
    // Should be false for non-serverless types
    assert.strictEqual(detectColdStart(200, 'cloud-sql-postgres'), false);

    // Should be true for serverless types if latency > 150ms
    assert.strictEqual(detectColdStart(200, 'neon'), true);
    assert.strictEqual(detectColdStart(200, 'firestore'), true);

    // Should be false for serverless types if latency <= 150ms
    assert.strictEqual(detectColdStart(100, 'neon'), false);
    assert.strictEqual(detectColdStart(150, 'firestore'), false);
});

test('detectWorkloadProfile', () => {
    const now = new Date().toISOString();

    // DORMANT
    const dormancy: ResourceDormancy = {
        isDormant: true,
        avgCpuUtilization: 0.1,
        avgMemoryUtilization: 5,
        analysisPeriodDays: 7
    };
    const metrics: ResourceMetrics = {
        cpuUtilization: 0.1,
        memoryUtilization: 5,
        timestamp: now
    };
    assert.strictEqual(detectWorkloadProfile(metrics, dormancy).type, 'DORMANT');

    // READ_HEAVY: High memory, low CPU, low saturation
    const readHeavyMetrics: ResourceMetrics = {
        cpuUtilization: 20,
        memoryUtilization: 70,
        connectionSaturation: 10,
        timestamp: now
    };
    assert.strictEqual(detectWorkloadProfile(readHeavyMetrics).type, 'READ_HEAVY');

    // WRITE_HEAVY: High saturation, moderate CPU/Memory
    const writeHeavyMetrics: ResourceMetrics = {
        cpuUtilization: 40,
        memoryUtilization: 40,
        connectionSaturation: 70,
        timestamp: now
    };
    assert.strictEqual(detectWorkloadProfile(writeHeavyMetrics).type, 'WRITE_HEAVY');

    // COMPUTE_INTENSIVE: Very high CPU
    const computeIntensiveMetrics: ResourceMetrics = {
        cpuUtilization: 85,
        memoryUtilization: 30,
        timestamp: now
    };
    assert.strictEqual(detectWorkloadProfile(computeIntensiveMetrics).type, 'COMPUTE_INTENSIVE');

    // BALANCED: Default
    const balancedMetrics: ResourceMetrics = {
        cpuUtilization: 30,
        memoryUtilization: 30,
        connectionSaturation: 20,
        timestamp: now
    };
    assert.strictEqual(detectWorkloadProfile(balancedMetrics).type, 'BALANCED');
});
