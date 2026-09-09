/**
 * Global project-slug registry.
 *
 * A project's `slug` is used to build GLOBAL, cross-tenant resources:
 *   - the Cloud Run service name  (`dfy-<slug>`, src/lib/utils.ts generateServiceName)
 *   - the Artifact Registry package name
 *   - the public hostname         (`<slug>.deployify.io` -> src/proxy.ts -> getProjectBySlugGlobal)
 *
 * Historically uniqueness was only enforced per-user, so two tenants could own the same
 * slug and therefore the same Cloud Run service and the same public hostname.
 *
 * Everything here is additive and dual-read: legacy projects have no registry document,
 * so every check consults the live `projects` collection as well. No backfill is required
 * for correctness.
 */
import { randomBytes } from 'crypto';
import { getDb, Collections } from '@/lib/firebase';
import type { DocumentData } from 'firebase-admin/firestore';

/**
 * How create-time collisions are handled.
 *   'off'     - exactly today's behaviour (per-user check only). Kill switch.
 *   'suffix'  - DEFAULT. Never blocks the user; a globally-taken slug gets a random suffix.
 *   'enforce' - reject the create with the existing 400 error.
 */
export type SlugUniquenessMode = 'off' | 'suffix' | 'enforce';

/**
 * How an ALREADY-EXISTING duplicate slug is resolved for hostname routing.
 *   'legacy'      - DEFAULT. Whatever Firestore returns first (== today's behaviour).
 *   'oldest-wins' - the project created first owns the hostname.
 * Both modes log every collision they see.
 */
export type SlugResolutionMode = 'legacy' | 'oldest-wins';

/** Mirror of `reservedSubdomains` in src/proxy.ts (that file is Edge runtime; do not import it). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
    'test-ui', 'www', 'api', 'dashboard', 'new', 'login', 'join',
    'settings', 'billing', 'invites', 'teams', 'user', 'edge-debug',
]);

/** How many same-slug project docs to inspect before picking an owner. */
export const SLUG_COLLISION_SCAN_LIMIT = 10;

const MAX_SUFFIX_ATTEMPTS = 5;
/** generateServiceName() truncates to 59 chars; keep room for `-xxxxxx` and `-pr-<n>`. */
const MAX_SUFFIXED_BASE = 52;

export function getSlugUniquenessMode(): SlugUniquenessMode {
    // Mock Firestore always reports documents as existing, so the registry cannot work
    // there. Local dev / audit runs keep exactly today's code path.
    if (process.env.MOCK_DB === 'true') return 'off';

    const raw = (process.env.PROJECT_SLUG_UNIQUENESS_MODE || '').trim().toLowerCase();
    if (raw === 'off' || raw === 'suffix' || raw === 'enforce') return raw;
    return 'suffix';
}

export function getSlugResolutionMode(): SlugResolutionMode {
    const raw = (process.env.PROJECT_SLUG_RESOLUTION_MODE || '').trim().toLowerCase();
    return raw === 'oldest-wins' ? 'oldest-wins' : 'legacy';
}

/** Normalise any createdAt representation to millis. Undated docs sort last. */
export function slugCreatedAtMillis(value: unknown): number {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
        const d = (value as { toDate: () => Date }).toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : Number.MAX_SAFE_INTEGER;
    }
    return Number.MAX_SAFE_INTEGER;
}

interface SlugDoc {
    id: string;
    data: () => DocumentData | undefined;
}

/**
 * Pick which project owns a slug when several share it.
 * Returns docs[0] (today's answer) unless PROJECT_SLUG_RESOLUTION_MODE=oldest-wins.
 */
export function pickSlugOwner<T extends SlugDoc>(docs: T[], slug: string): T {
    if (docs.length <= 1) return docs[0];

    const oldest = [...docs].sort((a, b) => {
        const ta = slugCreatedAtMillis(a.data()?.createdAt);
        const tb = slugCreatedAtMillis(b.data()?.createdAt);
        if (ta !== tb) return ta - tb;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })[0];

    const mode = getSlugResolutionMode();
    // The mock Firestore ignores .where() and always returns two canned docs, so a
    // "collision" there is an artefact of local dev, not real data.
    if (process.env.MOCK_DB !== 'true') {
        console.error(
            `[SlugRegistry] Slug collision for "${slug}": ${docs.map(d => d.id).join(',')} ` +
            `legacyWinner=${docs[0].id} oldestWinner=${oldest.id} mode=${mode}`
        );
    }

    return mode === 'oldest-wins' ? oldest : docs[0];
}

function suffixSlug(base: string): string {
    const trimmed = (base || 'project').slice(0, MAX_SUFFIXED_BASE).replace(/-+$/, '') || 'project';
    return `${trimmed}-${randomBytes(4).toString('hex').slice(0, 6)}`;
}

/** True if any project anywhere already uses this slug (dual-read for legacy rows). */
async function slugUsedByAnyProject(slug: string): Promise<boolean> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('slug', '==', slug)
        .limit(1)
        .get();
    return !snapshot.empty;
}

export type ClaimResult =
    | { ok: true; slug: string; changed: boolean }
    | { ok: false; slug: string };

/**
 * Atomically claim a globally-unique slug.
 * Race-safe: concurrent creates are serialised by a transaction on projectSlugs/<slug>.
 * Legacy-safe: projects written before the registry existed are found by the dual-read.
 */
export async function claimProjectSlug(desiredSlug: string, userId: string): Promise<ClaimResult> {
    const mode = getSlugUniquenessMode();
    if (mode === 'off') return { ok: true, slug: desiredSlug, changed: false };

    const db = getDb();
    const candidates: string[] = [desiredSlug];
    if (mode === 'suffix') {
        for (let i = 0; i < MAX_SUFFIX_ATTEMPTS; i++) candidates.push(suffixSlug(desiredSlug));
    }

    for (const candidate of candidates) {
        if (!candidate || RESERVED_SLUGS.has(candidate)) continue;
        if (await slugUsedByAnyProject(candidate)) continue;

        const claimed = await db.runTransaction(async (tx) => {
            const ref = db.collection(Collections.PROJECT_SLUGS).doc(candidate);
            const snap = await tx.get(ref);
            if (snap.exists) return false;
            tx.set(ref, { slug: candidate, userId, createdAt: new Date() });
            return true;
        });

        if (claimed) return { ok: true, slug: candidate, changed: candidate !== desiredSlug };
    }

    return { ok: false, slug: desiredSlug };
}

/** Best-effort release so a deleted project's name becomes reusable, as it is today. */
export async function releaseProjectSlug(slug: string): Promise<void> {
    if (!slug || getSlugUniquenessMode() === 'off') return;
    try {
        await getDb().collection(Collections.PROJECT_SLUGS).doc(slug).delete();
    } catch (error) {
        console.error(`[SlugRegistry] Failed to release slug "${slug}":`, error);
    }
}

/**
 * Defence in depth for collisions that already exist in production: refuse to let a
 * newer project deploy over the Cloud Run service owned by an older one.
 * Returns null when the deploy is allowed. Inert unless PROJECT_SLUG_RESOLUTION_MODE=oldest-wins.
 */
export async function findSlugSquatConflict(
    projectId: string,
    slug: string
): Promise<{ ownerProjectId: string } | null> {
    if (!slug || getSlugUniquenessMode() === 'off') return null;
    if (getSlugResolutionMode() !== 'oldest-wins') return null;

    const snapshot = await getDb()
        .collection(Collections.PROJECTS)
        .where('slug', '==', slug)
        .limit(SLUG_COLLISION_SCAN_LIMIT)
        .get();

    if (snapshot.docs.length <= 1) return null;

    const owner = pickSlugOwner(snapshot.docs, slug);
    return owner.id === projectId ? null : { ownerProjectId: owner.id };
}
