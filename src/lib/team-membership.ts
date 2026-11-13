import type { DocumentData } from 'firebase-admin/firestore';
import type { TeamMembership, TeamRole } from '@/types';
import { TEAM_ROLES } from '@/lib/team-roles';

/**
 * Team-membership document integrity (defect tenancy-data-3).
 *
 * `teamMemberships` has no uniqueness constraint on (teamId, userId) and
 * `acceptInvite` used to mint a fresh `tm_<random>` document on every redemption with no
 * dedupe. Revocation, by contrast, resolves the victim with a
 * `where teamId == && where userId ==` + `limit(1)` query and deletes exactly ONE
 * document, so a second membership document survives the removal and keeps serving
 * `checkProjectAccess` (src/middleware/rbac.ts).
 *
 * Everything here is pure and additive:
 *   - reads stay dual-read (legacy random-id documents are found by the same query),
 *   - no backfill is required: duplicates are collapsed lazily by the next accept and
 *     removed wholesale by the next revocation,
 *   - `TEAM_MEMBERSHIP_INTEGRITY_MODE=legacy` restores today's exact code paths, and
 *     MOCK_DB forces that mode (the mock Firestore ignores `.where()` and always returns
 *     two canned documents, so every pair looks duplicated there).
 */

export type MembershipIntegrityMode = 'legacy' | 'strict';

/** How many membership documents to inspect per (teamId, userId) pair. */
export const TEAM_MEMBERSHIP_SCAN_LIMIT = 10;

/** Bound on the delete sweep so a pathological pair can never spin forever. */
export const TEAM_MEMBERSHIP_SWEEP_ROUNDS = 5;

/**
 * Defaults to `strict`. Every strict-mode behaviour is a no-op on a clean
 * (one document per member) team, so it cannot change the answer for tenants whose data
 * is already correct. Only the exact string 'legacy' disables it.
 */
export function getMembershipIntegrityMode(): MembershipIntegrityMode {
    // The mock Firestore returns two canned docs for any query, so duplicate handling
    // cannot work there. Local dev / audit runs keep exactly today's code path.
    if (process.env.MOCK_DB === 'true') return 'legacy';

    const raw = (process.env.TEAM_MEMBERSHIP_INTEGRITY_MODE || '').trim().toLowerCase();
    return raw === 'legacy' ? 'legacy' : 'strict';
}

/** owner=4 ... viewer=1, unknown/missing=-1. Single source of truth: TEAM_ROLES. */
export function membershipRoleRank(role: unknown): number {
    const index = TEAM_ROLES.indexOf(role as TeamRole);
    return index === -1 ? -1 : TEAM_ROLES.length - index;
}

interface MembershipDoc {
    id: string;
    data: () => DocumentData | undefined;
}

/**
 * Pick which membership document is authoritative when several exist for one member.
 *
 * Returns docs[0] (today's arbitrary answer) unless the mode is `strict`, in which case
 * the highest-privilege document wins, ties broken by document id so the answer is
 * stable across requests. Highest-privilege - not least - is deliberate: the removal
 * sweep below is what closes the security hole, and picking the weakest document here
 * would silently demote members of live tenants whose duplicates disagree.
 *
 * Callers must pass a non-empty array.
 */
export function pickEffectiveMembership<T extends MembershipDoc>(docs: T[], teamId: string, userId: string): T {
    if (docs.length <= 1) return docs[0];

    const strongest = [...docs].sort((a, b) => {
        const ra = membershipRoleRank(a.data()?.role);
        const rb = membershipRoleRank(b.data()?.role);
        if (ra !== rb) return rb - ra;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })[0];

    const mode = getMembershipIntegrityMode();
    // Under MOCK_DB every pair "collides" because the mock ignores .where().
    if (process.env.MOCK_DB !== 'true') {
        console.error(
            `[TeamMembership] Duplicate memberships for team=${teamId} user=${userId}: ` +
            `${docs.map(d => d.id).join(',')} legacyWinner=${docs[0].id} ` +
            `effectiveWinner=${strongest.id} mode=${mode}`
        );
    }

    return mode === 'strict' ? strongest : docs[0];
}

/**
 * Deterministic document id for a NEW membership, so two concurrent redemptions of two
 * different invites for the same person target the same document path instead of racing
 * into two documents. Legacy documents keep their `tm_<random>` ids; nothing reads
 * memberships by id except `deleteTeamMembership`/`updateTeamMembership`, which are fed
 * the stored `id` field.
 */
export function membershipDocId(teamId: string, userId: string): string {
    const safe = (value: string) => (value || '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 120);
    return `tm_${safe(teamId)}__${safe(userId)}`;
}

/**
 * How many DISTINCT people hold `role`. The last-owner guards in
 * src/app/api/teams/[id]/members/[userId]/route.ts count membership documents, so two
 * documents for one owner read as "two owners" and let that owner be removed or demoted,
 * leaving the team ownerless. Legacy mode keeps the document count.
 */
export function countRoleHolders(
    memberships: readonly Pick<TeamMembership, 'userId' | 'role'>[],
    role: TeamRole
): number {
    const holders = memberships.filter(m => m.role === role);
    if (getMembershipIntegrityMode() !== 'strict') return holders.length;
    return new Set(holders.map(m => m.userId)).size;
}
