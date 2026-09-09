import { test } from 'node:test';
import assert from 'node:assert';
import {
    TEAM_ROLES,
    isTeamRole,
    canGrantRole,
    getInviteRoleGuardMode,
    getInviteAcceptGuardMode,
} from './team-roles';

function withEnv(key: string, value: string | undefined, fn: () => void) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    try {
        fn();
    } finally {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
    }
}

test('canGrantRole', async (t) => {
    await t.test('an admin cannot mint an owner-grade invite (tenancy-data-4)', () => {
        assert.strictEqual(canGrantRole('admin', 'owner'), false);
    });

    await t.test('an owner still can', () => {
        assert.strictEqual(canGrantRole('owner', 'owner'), true);
    });

    await t.test('every non-owner grant is unchanged for owner and admin', () => {
        for (const requester of ['owner', 'admin'] as const) {
            for (const invited of ['admin', 'member', 'viewer'] as const) {
                assert.strictEqual(canGrantRole(requester, invited), true,
                    `${requester} -> ${invited} must keep today's behaviour`);
            }
        }
    });

    await t.test('missing requester role never grants owner', () => {
        assert.strictEqual(canGrantRole(undefined, 'owner'), false);
        assert.strictEqual(canGrantRole(null, 'owner'), false);
    });
});

test('isTeamRole', async (t) => {
    await t.test('accepts exactly the four roles the routes validate today', () => {
        assert.deepStrictEqual([...TEAM_ROLES], ['owner', 'admin', 'member', 'viewer']);
        for (const role of TEAM_ROLES) assert.strictEqual(isTeamRole(role), true);
    });

    await t.test('rejects non-string and unknown values', () => {
        assert.strictEqual(isTeamRole('Owner'), false);
        assert.strictEqual(isTeamRole('superadmin'), false);
        assert.strictEqual(isTeamRole(['owner']), false);
        assert.strictEqual(isTeamRole(undefined), false);
    });
});

test('guard modes', async (t) => {
    await t.test('issue-time guard defaults to enforce', () => {
        withEnv('TEAM_INVITE_ROLE_GUARD_MODE', undefined, () => {
            assert.strictEqual(getInviteRoleGuardMode(), 'enforce');
        });
        withEnv('TEAM_INVITE_ROLE_GUARD_MODE', 'nonsense', () => {
            assert.strictEqual(getInviteRoleGuardMode(), 'enforce');
        });
    });

    await t.test('issue-time guard can be rolled back by env without a deploy', () => {
        withEnv('TEAM_INVITE_ROLE_GUARD_MODE', 'warn', () => {
            assert.strictEqual(getInviteRoleGuardMode(), 'warn');
        });
        withEnv('TEAM_INVITE_ROLE_GUARD_MODE', ' OFF ', () => {
            assert.strictEqual(getInviteRoleGuardMode(), 'off');
        });
    });

    await t.test('accept-time guard defaults to warn - today\'s behaviour', () => {
        withEnv('TEAM_INVITE_ACCEPT_GUARD_MODE', undefined, () => {
            assert.strictEqual(getInviteAcceptGuardMode(), 'warn');
        });
        withEnv('TEAM_INVITE_ACCEPT_GUARD_MODE', 'enforce', () => {
            assert.strictEqual(getInviteAcceptGuardMode(), 'enforce');
        });
    });
});
