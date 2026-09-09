import type { TeamRole } from '@/types';

/**
 * Role policy for project custom-domain mappings (defect ssrf-proxy-8).
 *
 * `checkProjectAccess` (src/middleware/rbac.ts:19-21) returns `{allowed: true, role}` for
 * ANY team membership, so `allowed` alone is a membership check, not an authorization
 * check. POST /api/projects/[id]/domains has always narrowed that to owner|admin
 * (route.ts:100-105); DELETE never did, so any 'admin'-below member -- 'member' and
 * 'viewer' alike -- could tear down a live tenant's domain mapping.
 *
 * Everything here is pure: no Firestore, no network, identical behaviour under MOCK_DB
 * and in production.
 */

export type DomainRoleMode = 'enforce' | 'report';

/**
 * Kill-switch for the DELETE-side role check.
 *
 * Defaults to `enforce`. This default is deliberate and is NOT a behaviour gamble: the
 * sibling POST handler in the same file has rejected member/viewer since domains shipped,
 * so "a member deletes a domain" was never a completable workflow -- they could not add
 * one back. The only caller is `deleteDomain` in src/store/project-slice.ts:668, which
 * already renders `data.error` from any non-2xx as a toast, exactly as it does for POST's
 * 403 today.
 *
 * `DOMAIN_DELETE_ROLE_ENFORCEMENT=report` restores the pre-fix behaviour (perform the
 * delete, log the would-be denial) without a code rollback. Only the exact string
 * 'report' disables enforcement.
 *
 * No MOCK_DB short-circuit is needed: the mock Firestore project document carries
 * `userId: 'audit-test'` and no `teamId` (src/lib/firebase.ts), and MOCK_SESSION's user id
 * is also 'audit-test' (src/lib/auth.ts:65), so checkProjectAccess takes the personal
 * -ownership branch and hands back role 'owner'. The guard is a no-op locally.
 */
export function getDomainDeleteRoleMode(): DomainRoleMode {
    return process.env.DOMAIN_DELETE_ROLE_ENFORCEMENT === 'report' ? 'report' : 'enforce';
}

/**
 * May a member holding `role` mutate a project's domain mappings?
 *
 * Byte-for-byte the predicate POST already applies -- `role !== 'owner' && role !== 'admin'`
 * inverted -- so routing POST through it cannot change POST's answer for any input.
 * Accepts the wider `undefined | null` because a legacy TEAM_MEMBERSHIPS document written
 * before the role field existed yields `membership.role === undefined`; those already fail
 * POST's guard today and must keep failing here (fail closed, no new privilege).
 */
export function canManageDomains(role: TeamRole | undefined | null): boolean {
    return role === 'owner' || role === 'admin';
}
