import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { normalizeTeamId, getTeamScopeMode } from './infrastructure-scope';

describe('infrastructure workspace scope', () => {
    const original = process.env.INFRA_TEAM_SCOPE_ENFORCEMENT;

    afterEach(() => {
        if (original === undefined) {
            delete process.env.INFRA_TEAM_SCOPE_ENFORCEMENT;
        } else {
            process.env.INFRA_TEAM_SCOPE_ENFORCEMENT = original;
        }
    });

    test('normalizeTeamId keeps a real team id', () => {
        assert.strictEqual(normalizeTeamId('team_abc123'), 'team_abc123');
        assert.strictEqual(normalizeTeamId('  team_abc123  '), 'team_abc123');
    });

    test('normalizeTeamId treats absent and sentinel values as no team', () => {
        // Parity with the sentinel handling already in GET /api/projects.
        assert.strictEqual(normalizeTeamId(null), null);
        assert.strictEqual(normalizeTeamId(undefined), null);
        assert.strictEqual(normalizeTeamId(''), null);
        assert.strictEqual(normalizeTeamId('   '), null);
        assert.strictEqual(normalizeTeamId('null'), null);
        assert.strictEqual(normalizeTeamId('undefined'), null);
    });

    test('team scope enforcement is on by default', () => {
        delete process.env.INFRA_TEAM_SCOPE_ENFORCEMENT;
        assert.strictEqual(getTeamScopeMode(), 'enforce');
    });

    test('only the exact string "report" disables enforcement', () => {
        process.env.INFRA_TEAM_SCOPE_ENFORCEMENT = 'report';
        assert.strictEqual(getTeamScopeMode(), 'report');

        for (const value of ['enforce', 'REPORT', 'true', 'false', '']) {
            process.env.INFRA_TEAM_SCOPE_ENFORCEMENT = value;
            assert.strictEqual(getTeamScopeMode(), 'enforce', `expected enforce for "${value}"`);
        }
    });
});
