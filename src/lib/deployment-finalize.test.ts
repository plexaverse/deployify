import { test } from 'node:test';
import assert from 'node:assert';
import {
    TERMINAL_DEPLOYMENT_STATUSES,
    getDeploymentFinalizeMode,
    isTerminalDeploymentStatus,
} from './deployment-finalize';
import type { DeploymentStatus } from '@/types';

test('DEPLOYMENT_FINALIZE_MODE parsing', async (t) => {
    const prevMode = process.env.DEPLOYMENT_FINALIZE_MODE;
    const prevMock = process.env.MOCK_DB;
    t.after(() => {
        if (prevMode === undefined) delete process.env.DEPLOYMENT_FINALIZE_MODE;
        else process.env.DEPLOYMENT_FINALIZE_MODE = prevMode;
        if (prevMock === undefined) delete process.env.MOCK_DB;
        else process.env.MOCK_DB = prevMock;
    });

    await t.test('defaults to off - today behaviour', () => {
        delete process.env.MOCK_DB;
        delete process.env.DEPLOYMENT_FINALIZE_MODE;
        assert.strictEqual(getDeploymentFinalizeMode(), 'off');
        process.env.DEPLOYMENT_FINALIZE_MODE = '';
        assert.strictEqual(getDeploymentFinalizeMode(), 'off');
        process.env.DEPLOYMENT_FINALIZE_MODE = 'nonsense';
        assert.strictEqual(getDeploymentFinalizeMode(), 'off');
    });

    await t.test('accepts audit and guard, case/space insensitive', () => {
        delete process.env.MOCK_DB;
        process.env.DEPLOYMENT_FINALIZE_MODE = ' Audit ';
        assert.strictEqual(getDeploymentFinalizeMode(), 'audit');
        process.env.DEPLOYMENT_FINALIZE_MODE = 'GUARD';
        assert.strictEqual(getDeploymentFinalizeMode(), 'guard');
    });

    await t.test('MOCK_DB forces off - the mock Firestore cannot do a compare-and-set', () => {
        process.env.MOCK_DB = 'true';
        process.env.DEPLOYMENT_FINALIZE_MODE = 'guard';
        assert.strictEqual(getDeploymentFinalizeMode(), 'off');
    });
});

test('terminal status set matches the syncDeploymentStatus early return', () => {
    const terminal: DeploymentStatus[] = ['ready', 'error', 'cancelled'];
    const active: DeploymentStatus[] = ['queued', 'building', 'deploying'];

    assert.strictEqual(TERMINAL_DEPLOYMENT_STATUSES.size, terminal.length);
    for (const s of terminal) assert.strictEqual(isTerminalDeploymentStatus(s), true, s);
    for (const s of active) assert.strictEqual(isTerminalDeploymentStatus(s), false, s);

    // Legacy / corrupt rows must never look finalized, or a real build would be abandoned.
    assert.strictEqual(isTerminalDeploymentStatus(undefined), false);
    assert.strictEqual(isTerminalDeploymentStatus(null), false);
    assert.strictEqual(isTerminalDeploymentStatus(''), false);
    assert.strictEqual(isTerminalDeploymentStatus('READY'), false);
});
