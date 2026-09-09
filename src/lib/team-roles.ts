import type { TeamRole } from '@/types';

/**
 * Team role policy helpers.
 *
 * These are pure functions on top of `TeamRole` so the invite and member-role endpoints
 * can share one definition of "who may grant what". They read no Firestore and hold no
 * state, so they behave identically under MOCK_DB and in production.
 */

export type RoleGuardMode = 'off' | 'warn' | 'enforce';

/** The four roles accepted by every team endpoint today. Order is highest -> lowest privilege. */
export const TEAM_ROLES: readonly TeamRole[] = ['owner', 'admin', 'member', 'viewer'];

export function isTeamRole(value: unknown): value is TeamRole {
    return typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value);
}

function readMode(raw: string | undefined, fallback: RoleGuardMode): RoleGuardMode {
    const value = (raw || '').trim().toLowerCase();
    if (value === 'off' || value === 'warn' || value === 'enforce') return value;
    return fallback;
}

/**
 * Guard on ISSUING an owner-grade invite (POST /api/teams/[id]/invite).
 *
 * Defaults to `enforce` - unlike the slug/repo-binding flags this one cannot regress a
 * real user flow: the only caller (sendTeamInvite in src/store/settings-slice.ts) sends
 * whatever `inviteRole` holds, and the SegmentedControl that sets it offers exactly
 * admin | member | viewer (src/app/dashboard/settings/page.tsx). No UI path can produce
 * role='owner', so enforcing costs nothing and defaulting to `warn` would just ship the
 * escalation. `TEAM_INVITE_ROLE_GUARD_MODE=warn` (or `off`) restores the legacy behaviour
 * without a code rollback if an unknown API client turns out to depend on it.
 *
 * No MOCK_DB short-circuit: under MOCK_DB the mock membership doc carries no `role`
 * field, so the pre-existing owner-or-admin gate in the route already 403s before this
 * check is reached. Local dev is unchanged either way.
 */
export function getInviteRoleGuardMode(): RoleGuardMode {
    return readMode(process.env.TEAM_INVITE_ROLE_GUARD_MODE, 'enforce');
}

/**
 * Guard on REDEEMING an owner-grade invite that is already in Firestore
 * (POST /api/invites/accept).
 *
 * Defaults to `warn` - log only, today's behaviour - because this one CAN affect a
 * legitimately issued invite (an owner minted an owner invite by API and has since been
 * demoted or has left). Invites carry a 7-day TTL (createInvite in src/lib/db.ts), so the
 * entire pre-fix backlog drains on its own within a week of shipping the issue-time guard;
 * `warn` exists to prove that from the audit log before anyone flips it to `enforce`.
 */
export function getInviteAcceptGuardMode(): RoleGuardMode {
    return readMode(process.env.TEAM_INVITE_ACCEPT_GUARD_MODE, 'warn');
}

/**
 * May a member holding `requesterRole` grant `invitedRole`?
 *
 * Mirrors the guard the sibling PATCH endpoint already enforces at
 * src/app/api/teams/[id]/members/[userId]/route.ts:115 - only an owner may hand out
 * 'owner'. Every other pair returns true, i.e. exactly today's behaviour.
 */
export function canGrantRole(requesterRole: TeamRole | undefined | null, invitedRole: TeamRole): boolean {
    if (invitedRole !== 'owner') return true;
    return requesterRole === 'owner';
}
