import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import {
    countRoleHolders,
    getMembershipIntegrityMode,
    membershipDocId,
    membershipRoleRank,
    pickEffectiveMembership,
} from './team-membership';

type FakeDoc = { id: string; data: () => Record<string, unknown> };

const doc = (id: string, role?: string): FakeDoc => ({
    id,
    data: () => ({ id, teamId: 'team_acme', userId: '4242', role }),
});

// Firestore returns __name__ ascending for an equality query with no orderBy, so the
// pre-fix limit(1) resolved whichever duplicate happened to sort first.
const VIEWER_DUP = doc('tm_aaaaaaaaaaaa', 'viewer');
const ADMIN_DUP = doc('tm_zzzzzzzzzzzz', 'admin');

describe('team membership integrity (defect tenancy-data-3)', () => {
    const originalMode = process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE;
    const originalMock = process.env.MOCK_DB;

    afterEach(() => {
        if (originalMode === undefined) delete process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE;
        else process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE = originalMode;
        if (originalMock === undefined) delete process.env.MOCK_DB;
        else process.env.MOCK_DB = originalMock;
    });

    test('integrity handling is on by default and only "legacy" disables it', () => {
        delete process.env.MOCK_DB;
        delete process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE;
        assert.strictEqual(getMembershipIntegrityMode(), 'strict');

        process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE = 'legacy';
        assert.strictEqual(getMembershipIntegrityMode(), 'legacy');

        for (const value of ['strict', 'LEGACY_', 'true', 'off', '']) {
            process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE = value;
            assert.strictEqual(getMembershipIntegrityMode(), 'strict', `expected strict for "${value}"`);
        }
    });

    test('MOCK_DB forces legacy mode - the mock Firestore ignores .where()', () => {
        process.env.MOCK_DB = 'true';
        delete process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE;
        assert.strictEqual(getMembershipIntegrityMode(), 'legacy');
    });

    test('a single membership document is returned untouched in every mode', () => {
        delete process.env.MOCK_DB;
        for (const value of ['legacy', 'strict']) {
            process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE = value;
            assert.strictEqual(pickEffectiveMembership([ADMIN_DUP], 'team_acme', '4242').id, ADMIN_DUP.id);
        }
    });

    test('legacy mode preserves the pre-fix winner exactly', () => {
        process.env.MOCK_DB = 'true'; // also silences the duplicate log
        assert.strictEqual(getMembershipIntegrityMode(), 'legacy');
        assert.strictEqual(pickEffectiveMembership([VIEWER_DUP, ADMIN_DUP], 'team_acme', '4242').id, VIEWER_DUP.id);
    });

    test('strict mode resolves duplicates deterministically, whatever the query order', () => {
        delete process.env.MOCK_DB;
        process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE = 'strict';
        assert.strictEqual(pickEffectiveMembership([VIEWER_DUP, ADMIN_DUP], 'team_acme', '4242').id, ADMIN_DUP.id);
        assert.strictEqual(pickEffectiveMembership([ADMIN_DUP, VIEWER_DUP], 'team_acme', '4242').id, ADMIN_DUP.id);

        // Equal roles (and unknown/missing roles) tie-break on document id, so the same
        // request always resolves to the same document.
        const a = doc('tm_aaa', 'member');
        const b = doc('tm_bbb', 'member');
        assert.strictEqual(pickEffectiveMembership([b, a], 'team_acme', '4242').id, a.id);
        const undatedA = doc('tm_aaa');
        const undatedB = doc('tm_bbb');
        assert.strictEqual(pickEffectiveMembership([undatedB, undatedA], 'team_acme', '4242').id, undatedA.id);
    });

    test('role ranking follows TEAM_ROLES and never crashes on legacy junk', () => {
        assert.ok(membershipRoleRank('owner') > membershipRoleRank('admin'));
        assert.ok(membershipRoleRank('admin') > membershipRoleRank('member'));
        assert.ok(membershipRoleRank('member') > membershipRoleRank('viewer'));
        assert.ok(membershipRoleRank('viewer') > membershipRoleRank(undefined));
        assert.strictEqual(membershipRoleRank('superuser'), -1);
        assert.strictEqual(membershipRoleRank(null), -1);
        assert.strictEqual(membershipRoleRank(7), -1);
    });

    test('membershipDocId is deterministic and Firestore-safe', () => {
        assert.strictEqual(membershipDocId('team_acme', '4242'), 'tm_team_acme__4242');
        assert.strictEqual(membershipDocId('team_acme', '4242'), membershipDocId('team_acme', '4242'));
        // No path separators can reach the document id.
        assert.ok(!membershipDocId('team/../acme', 'a/b').includes('/'));
        // Never collides with a legacy generateId('tm') id, which has no '__'.
        assert.ok(membershipDocId('team_acme', '4242').includes('__'));
    });

    test('the last-owner guard counts people, not documents', () => {
        const members = [
            { userId: '4242', role: 'owner' as const },
            { userId: '4242', role: 'owner' as const }, // duplicate document, same human
            { userId: '99', role: 'member' as const },
        ];

        process.env.MOCK_DB = 'true';
        assert.strictEqual(countRoleHolders(members, 'owner'), 2, 'legacy counts documents');

        delete process.env.MOCK_DB;
        process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE = 'strict';
        assert.strictEqual(countRoleHolders(members, 'owner'), 1, 'strict counts distinct owners');
        assert.strictEqual(countRoleHolders(members, 'member'), 1);
        assert.strictEqual(countRoleHolders(members, 'admin'), 0);
    });
});
