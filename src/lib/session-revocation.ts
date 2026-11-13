/**
 * Session revocation for the stateless session JWT.
 *
 * The session cookie is a self-contained 7-day HS256 JWT, so before this there was no way
 * to invalidate one: logout only deleted the cookie client-side, and a token copied off a
 * machine stayed valid for its full life. That also meant removing someone from a team, or
 * responding to a stolen laptop, could not actually cut their access.
 *
 * Approach: a per-user `sessionsRevokedAt` timestamp. Any token issued before it is
 * rejected. That keeps the JWT stateless on the happy path and needs no migration — a user
 * with no `sessionsRevokedAt` behaves exactly as today.
 *
 * Cost control: the lookup is cached in-process for REVOCATION_CACHE_TTL_MS (default 60s),
 * so this costs at most one Firestore read per user per minute rather than one per request.
 * The trade-off is that a revocation can take up to that long to propagate across
 * instances; set the TTL lower if that matters more than the read volume.
 *
 * SESSION_REVOCATION_ENABLED=false disables the check entirely.
 */
import { getDb, Collections } from '@/lib/firebase';

interface CacheEntry {
    revokedAtMs: number | null;
    fetchedAtMs: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 10_000;

function ttlMs(): number {
    const raw = Number(process.env.REVOCATION_CACHE_TTL_MS);
    return Number.isFinite(raw) && raw >= 0 ? raw : 60_000;
}

export function isRevocationEnabled(): boolean {
    return process.env.SESSION_REVOCATION_ENABLED !== 'false';
}

/** Drop the cached entry so the next check re-reads. Called right after a revocation. */
export function invalidateRevocationCache(userId: string): void {
    cache.delete(userId);
}

function toMillis(value: unknown): number | null {
    if (!value) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    // Firestore Timestamp
    const ts = value as { toDate?: () => Date };
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    return null;
}

/**
 * True when a token issued at `issuedAtSeconds` has been revoked for this user.
 *
 * Fails OPEN on a lookup error: a Firestore blip must not log every user out. The window
 * that opens is small and bounded by the cache TTL.
 */
export async function isSessionRevoked(userId: string, issuedAtSeconds: number | undefined): Promise<boolean> {
    if (!isRevocationEnabled() || !userId || !issuedAtSeconds) return false;
    if (process.env.MOCK_DB === 'true') return false;

    const now = Date.now();
    const cached = cache.get(userId);

    let revokedAtMs: number | null;
    if (cached && now - cached.fetchedAtMs < ttlMs()) {
        revokedAtMs = cached.revokedAtMs;
    } else {
        try {
            const snap = await getDb().collection(Collections.USERS).doc(userId).get();
            revokedAtMs = toMillis(snap.data()?.sessionsRevokedAt);
        } catch (e) {
            console.error(`[SessionRevocation] Lookup failed for ${userId}; allowing (fail-open):`, e);
            return false;
        }

        if (cache.size >= MAX_CACHE_ENTRIES) {
            cache.clear();
        }
        cache.set(userId, { revokedAtMs, fetchedAtMs: now });
    }

    if (revokedAtMs === null) return false;
    return issuedAtSeconds * 1000 < revokedAtMs;
}

/** Invalidate every session for this user, immediately. */
export async function revokeUserSessions(userId: string): Promise<void> {
    if (!userId || process.env.MOCK_DB === 'true') return;
    try {
        await getDb().collection(Collections.USERS).doc(userId).update({
            sessionsRevokedAt: new Date(),
        });
        invalidateRevocationCache(userId);
    } catch (e) {
        console.error(`[SessionRevocation] Failed to revoke sessions for ${userId}:`, e);
    }
}
