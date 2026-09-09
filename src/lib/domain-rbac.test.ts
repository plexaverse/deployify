import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { canManageDomains, getDomainDeleteRoleMode } from './domain-rbac';
import { TEAM_ROLES } from './team-roles';

describe('project domain role policy (ssrf-proxy-8)', () => {
    const original = process.env.DOMAIN_DELETE_ROLE_ENFORCEMENT;

    afterEach(() => {
        if (original === undefined) {
            delete process.env.DOMAIN_DELETE_ROLE_ENFORCEMENT;
        } else {
            process.env.DOMAIN_DELETE_ROLE_ENFORCEMENT = original;
        }
    });

    test('owners and admins may manage domains', () => {
        assert.strictEqual(canManageDomains('owner'), true);
        assert.strictEqual(canManageDomains('admin'), true);
    });

    test('members and viewers may not -- this is the defect', () => {
        // DELETE used to accept both of these.
        assert.strictEqual(canManageDomains('member'), false);
        assert.strictEqual(canManageDomains('viewer'), false);
    });

    test('a legacy membership with no role field fails closed', () => {
        assert.strictEqual(canManageDomains(undefined), false);
        assert.strictEqual(canManageDomains(null), false);
    });

    test('the predicate matches the inline guard POST has always used', () => {
        // Pins the refactor: routing POST through canManageDomains cannot change its answer.
        for (const role of TEAM_ROLES) {
            assert.strictEqual(
                canManageDomains(role),
                !(role !== 'owner' && role !== 'admin'),
                `divergence for role "${role}"`
            );
        }
    });

    test('DELETE role enforcement is on by default', () => {
        delete process.env.DOMAIN_DELETE_ROLE_ENFORCEMENT;
        assert.strictEqual(getDomainDeleteRoleMode(), 'enforce');
    });

    test('only the exact string "report" disables enforcement', () => {
        process.env.DOMAIN_DELETE_ROLE_ENFORCEMENT = 'report';
        assert.strictEqual(getDomainDeleteRoleMode(), 'report');

        for (const value of ['enforce', 'REPORT', 'true', 'false', '', ' report ']) {
            process.env.DOMAIN_DELETE_ROLE_ENFORCEMENT = value;
            assert.strictEqual(getDomainDeleteRoleMode(), 'enforce', `expected enforce for "${value}"`);
        }
    });
});
