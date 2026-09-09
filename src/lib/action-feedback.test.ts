import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    describeActionResult,
    readJsonBody,
    resolveDeployActionFeedbackMode,
    toActionResult,
} from './action-feedback';

const REDEPLOY_COPY = { success: 'Deployment triggered', failure: 'Failed to trigger deployment' };
const CANCEL_COPY = { success: 'Deployment cancelled', failure: 'Failed to cancel deployment' };

describe('resolveDeployActionFeedbackMode', () => {
    it('defaults to accurate when unset or unrecognised', () => {
        assert.strictEqual(resolveDeployActionFeedbackMode(undefined), 'accurate');
        assert.strictEqual(resolveDeployActionFeedbackMode(''), 'accurate');
        assert.strictEqual(resolveDeployActionFeedbackMode('nonsense'), 'accurate');
        assert.strictEqual(resolveDeployActionFeedbackMode('accurate'), 'accurate');
    });

    it('only opts into legacy on the exact literal', () => {
        assert.strictEqual(resolveDeployActionFeedbackMode('legacy'), 'legacy');
        assert.strictEqual(resolveDeployActionFeedbackMode('LEGACY'), 'accurate');
    });
});

describe('toActionResult', () => {
    it('surfaces the usage-cap 403 body from /api/projects/[id]/deploy', () => {
        const result = toActionResult(
            403,
            false,
            { error: 'Usage limit exceeded: deployments. Please upgrade your plan.' },
            'Failed to trigger deployment'
        );
        assert.deepStrictEqual(result, {
            ok: false,
            status: 403,
            error: 'Usage limit exceeded: deployments. Please upgrade your plan.',
        });
    });

    it('falls back to the caller copy when the body has no usable text', () => {
        assert.strictEqual(toActionResult(500, false, null, 'Failed to trigger deployment').error, 'Failed to trigger deployment');
        assert.strictEqual(toActionResult(400, false, { error: '   ' }, 'Failed to cancel deployment').error, 'Failed to cancel deployment');
        assert.strictEqual(toActionResult(400, false, 'not json at all', 'Failed to cancel deployment').error, 'Failed to cancel deployment');
    });

    it('uses message as the secondary failure field (Cloud Build 500)', () => {
        const result = toActionResult(500, false, { deployment: {}, error: 'Failed to trigger Cloud Build', message: 'quota' }, 'Failed to trigger deployment');
        assert.strictEqual(result.error, 'Failed to trigger Cloud Build');
        assert.strictEqual(toActionResult(500, false, { message: 'quota' }, 'x').error, 'quota');
    });

    it('marks a plain 201 as a real success', () => {
        const result = toActionResult(201, true, { deployment: { id: 'd1', status: 'queued' }, message: 'Cloud Build triggered successfully.' }, 'Failed to trigger deployment');
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.noop, undefined);
    });

    it('marks a superseded 201 (deployment already cancelled) as a no-op', () => {
        const result = toActionResult(
            201,
            true,
            { deployment: { id: 'd1', status: 'cancelled' }, message: 'A newer deployment for this project is already in progress.' },
            'Failed to trigger deployment'
        );
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.noop, true);
        assert.strictEqual(result.message, 'A newer deployment for this project is already in progress.');
    });

    it('treats the cancel 200 body as an ordinary success', () => {
        const result = toActionResult(200, true, { success: true, message: 'Deployment cancelled successfully' }, 'Failed to cancel deployment');
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.noop, undefined);
    });
});

describe('readJsonBody', () => {
    it('returns null instead of throwing on a non-JSON body', async () => {
        assert.strictEqual(await readJsonBody({ json: async () => { throw new SyntaxError('Unexpected token <'); } }), null);
    });

    it('returns the parsed body otherwise', async () => {
        assert.deepStrictEqual(await readJsonBody({ json: async () => ({ error: 'nope' }) }), { error: 'nope' });
    });
});

describe('describeActionResult', () => {
    it('shows the server error on a rejected redeploy', () => {
        const feedback = describeActionResult(
            { ok: false, status: 403, error: 'Usage limit exceeded: deployments. Please upgrade your plan.' },
            REDEPLOY_COPY,
            'accurate'
        );
        assert.deepStrictEqual(feedback, {
            kind: 'error',
            text: 'Usage limit exceeded: deployments. Please upgrade your plan.',
        });
    });

    it('shows the server error on a rejected cancel', () => {
        const feedback = describeActionResult(
            { ok: false, status: 400, error: 'Cannot cancel completed deployment' },
            CANCEL_COPY,
            'accurate'
        );
        assert.strictEqual(feedback.kind, 'error');
        assert.strictEqual(feedback.text, 'Cannot cancel completed deployment');
    });

    it('keeps the exact success copy the pages show today', () => {
        assert.deepStrictEqual(describeActionResult({ ok: true, status: 201 }, REDEPLOY_COPY, 'accurate'), {
            kind: 'success',
            text: 'Deployment triggered',
        });
    });

    it('warns instead of celebrating when the deploy was superseded', () => {
        const feedback = describeActionResult(
            { ok: true, status: 201, noop: true, message: 'A newer deployment for this project is already in progress.' },
            REDEPLOY_COPY,
            'accurate'
        );
        assert.strictEqual(feedback.kind, 'warning');
        assert.strictEqual(feedback.text, 'A newer deployment for this project is already in progress.');
    });

    it('legacy mode reproduces the pre-fix toast for every outcome', () => {
        const outcomes = [
            { ok: false, status: 403, error: 'Usage limit exceeded: deployments. Please upgrade your plan.' },
            { ok: false, status: 0, error: 'Network error. Please check your connection and try again.' },
            { ok: true, status: 201, noop: true, message: 'superseded' },
            { ok: true, status: 201 },
        ];
        for (const outcome of outcomes) {
            assert.deepStrictEqual(describeActionResult(outcome, REDEPLOY_COPY, 'legacy'), {
                kind: 'success',
                text: 'Deployment triggered',
            });
        }
    });
});
