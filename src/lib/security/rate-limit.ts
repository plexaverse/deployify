/**
 * Shared request rate limiting.
 *
 * Three defects live in the limiter this module replaces (`src/proxy.ts`):
 *
 *  1. BYPASS. The client identifier was `x-forwarded-for.split(',')[0]`. Cloud
 *     Run's front end *appends* its view of the caller to whatever XFF the
 *     caller sent, so element 0 is attacker-controlled and every distinct
 *     header value bought a fresh bucket. The trusted element is counted from
 *     the RIGHT (`resolveClientIp`).
 *  2. UNBOUNDED STORE. The Map had no eviction at all and was keyed on the raw
 *     pathname, so `/api/<random>` grew it without limit until the instance
 *     OOMed. The store is now hard-capped and swept (`evictIfNeeded`).
 *  3. DEAD CODE. `checkRateLimit` in `./index` was exported and never imported,
 *     so the copy that actually ran (in proxy.ts) silently diverged from it.
 *     Both now call this one implementation.
 *
 * NOT fixed here, and deliberately so: the store is per-instance. `src/proxy.ts`
 * is compiled as Next 16 Edge middleware, which cannot reach Redis, Firestore or
 * any node builtin, so a shared counter is not implementable in this layer. See
 * `docs`/env.example for the staged path (Cloud Armor at the LB).
 *
 * NOTE: no node builtins in here. It is imported by `src/proxy.ts`.
 */

export type RateLimitMode = 'legacy' | 'report' | 'enforce' | 'off';
export type RateLimitScope = 'path' | 'class';
export type RateLimitClass = 'strict' | 'default';

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

/** Routes that get the tighter bucket. Verbatim from the pre-fix proxy.ts. */
export const STRICT_RATE_LIMIT_ROUTES = [
    '/api/auth/',
    '/api/webhooks/',
] as const;

/**
 * proxy.ts has always used a hardcoded 60s window. It is NOT read from
 * `RATE_LIMIT_WINDOW_MS`: that variable is already set on live revisions for the
 * (dead) `./index` helper, and adopting it here would silently change the
 * window the proxy has been running with.
 */
export const PROXY_WINDOW_MS = 60_000;

function envInt(name: string, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt((process.env[name] || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        return fallback;
    }
    return parsed;
}

/**
 * Operating mode. Mirrors `getCsrfMode()` in `./csrf`.
 *
 * - `legacy`  - today's behaviour, bit for bit: spoofable first-XFF identifier,
 *               `${ip}:${pathname}` key, 100/30 per minute. DEFAULT, so landing
 *               this module changes no request outcome. Only the memory fix
 *               (bounded store) is active.
 * - `report`  - the hardened decision is computed and logged, the LEGACY
 *               decision is still the one enforced. Soak here first.
 * - `enforce` - the hardened decision is enforced.
 * - `off`     - kill switch, no limiting at all.
 */
export function getRateLimitMode(): RateLimitMode {
    const raw = (process.env.RATE_LIMIT_MODE || '').trim().toLowerCase();
    if (raw === 'legacy' || raw === 'report' || raw === 'enforce' || raw === 'off') {
        return raw;
    }
    return 'legacy';
}

/**
 * Bucket granularity once `enforce` is on.
 *
 * - `path`  - `${ip}:${pathname}`, today's granularity. DEFAULT: flipping to
 *             enforce then only closes the XFF bypass, nothing tightens.
 * - `class` - `${strict|default}:${ip}`, one bucket for all of `/api/`. This is
 *             the granularity that actually caps an attacker (per-path, 86 API
 *             routes x 100/min = 8600 rpm from one IP), but it is a real policy
 *             tightening for chatty dashboards, so it ships dark with its own
 *             higher limits.
 */
export function getRateLimitScope(): RateLimitScope {
    return (process.env.RATE_LIMIT_SCOPE || '').trim().toLowerCase() === 'class' ? 'class' : 'path';
}

/**
 * How many trailing XFF elements were written by infrastructure we control.
 *
 * 1 (default) is correct for the current topology: the dashboard is published
 * through a Cloud Run domain mapping, so the GFE appends exactly one element.
 * Set to 2 if the dashboard is ever put behind a Global External ALB /
 * serverless NEG (`src/lib/gcp/loadbalancer.ts` builds those for TENANT
 * services today, not for the dashboard) - otherwise every request would be
 * attributed to a handful of GFE IPs and share one bucket.
 */
export function getTrustedProxyHops(): number {
    return envInt('TRUSTED_PROXY_HOPS', 1, 1, 8);
}

function getMaxStoreEntries(): number {
    return envInt('RATE_LIMIT_MAX_ENTRIES', 20_000, 100, 1_000_000);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/** Identifiers are attacker-influenced; never let one grow the store per byte. */
const MAX_KEY_LENGTH = 160;

let opCount = 0;

/** One provenance sample per window per instance, so `report` cannot flood logs. */
let lastProvenanceLogAt = 0;

/** FNV-1a. Only used to keep truncated keys distinct - never for security. */
function fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

/**
 * Bound the key length without letting two different long identifiers collapse
 * onto one bucket (which would 429 a caller that today would pass).
 */
function boundKey(identifier: string): string {
    if (identifier.length <= MAX_KEY_LENGTH) {
        return identifier;
    }
    return `${identifier.slice(0, MAX_KEY_LENGTH - 8)}#${fnv1a(identifier)}`;
}

function sweepExpired(now: number): void {
    for (const [key, value] of rateLimitStore) {
        if (now > value.resetAt) {
            rateLimitStore.delete(key);
        }
    }
}

/**
 * Keep the store bounded. Eviction can only ever RESET a counter, never create
 * a 429, so it fails open and cannot reject a legitimate caller.
 */
function evictIfNeeded(now: number): void {
    const max = getMaxStoreEntries();
    if (rateLimitStore.size < max) {
        return;
    }

    sweepExpired(now);
    if (rateLimitStore.size < max) {
        return;
    }

    // Still full: drop the oldest half. Map iterates in insertion order, and
    // deleting during iteration is well defined.
    const drop = Math.ceil(rateLimitStore.size / 2);
    let dropped = 0;
    for (const key of rateLimitStore.keys()) {
        rateLimitStore.delete(key);
        if (++dropped >= drop) break;
    }
}

/**
 * Fixed-window counter. Signature and return shape are unchanged from both
 * pre-fix copies, so `./index`'s exported `checkRateLimit` keeps its contract.
 */
export function checkRateLimit(
    identifier: string,
    limit: number = 100,
    windowMs: number = PROXY_WINDOW_MS
): RateLimitResult {
    const now = Date.now();
    const key = boundKey(identifier);

    // Cheap steady-state hygiene, plus the hard cap.
    if ((++opCount & 0x1ff) === 0) {
        sweepExpired(now);
    }
    evictIfNeeded(now);

    const record = rateLimitStore.get(key);

    if (!record || now > record.resetAt) {
        const resetAt = now + windowMs;
        rateLimitStore.set(key, { count: 1, resetAt });
        return { allowed: true, remaining: limit - 1, resetAt };
    }

    if (record.count >= limit) {
        return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count++;
    return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

/** Test-only. Not referenced by product code. */
export function resetRateLimitStore(): void {
    rateLimitStore.clear();
    opCount = 0;
    lastProvenanceLogAt = 0;
}

/** Test-only. Not referenced by product code. */
export function rateLimitStoreSize(): number {
    return rateLimitStore.size;
}

// ---------------------------------------------------------------------------
// Client identity
// ---------------------------------------------------------------------------

export interface ClientIpResolution {
    /** Identifier to rate limit on: the rightmost element we trust. */
    ip: string;
    /** What the pre-fix code used: the leftmost element, caller-controlled. */
    legacyIp: string;
    /** True when the caller supplied XFF elements of its own. */
    spoofSuspected: boolean;
}

export function resolveClientIp(
    xForwardedFor: string | null,
    xRealIp: string | null,
    hops: number = getTrustedProxyHops()
): ClientIpResolution {
    const entries = (xForwardedFor || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);

    const realIp = (xRealIp || '').trim();
    const legacyIp = entries[0] || realIp || 'unknown';

    if (entries.length === 0) {
        return { ip: realIp || 'unknown', legacyIp, spoofSuspected: false };
    }

    // Infrastructure appends to the RIGHT of anything the caller sent, so count
    // back from the end. Clamped at 0: a chain shorter than the configured hop
    // count degrades to the pre-fix element rather than to a single shared key.
    const index = Math.max(0, entries.length - hops);
    const ip = entries[index] || legacyIp;

    return { ip, legacyIp, spoofSuspected: ip !== legacyIp };
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export function classifyRoute(pathname: string): RateLimitClass {
    return STRICT_RATE_LIMIT_ROUTES.some(route => pathname.startsWith(route)) ? 'strict' : 'default';
}

/**
 * Limits. The `path`-scope numbers are the literals proxy.ts has always used
 * (100 / 30). They are NOT read from `RATE_LIMIT_REQUESTS` for the same reason
 * `PROXY_WINDOW_MS` is not read from `RATE_LIMIT_WINDOW_MS`.
 */
export function limitFor(routeClass: RateLimitClass, scope: RateLimitScope): number {
    if (scope === 'class') {
        return routeClass === 'strict'
            ? envInt('RATE_LIMIT_STRICT_CLASS_REQUESTS', 60, 1, 1_000_000)
            : envInt('RATE_LIMIT_CLASS_REQUESTS', 600, 1, 1_000_000);
    }
    return routeClass === 'strict'
        ? envInt('RATE_LIMIT_STRICT_REQUESTS', 30, 1, 1_000_000)
        : envInt('RATE_LIMIT_DEFAULT_REQUESTS', 100, 1, 1_000_000);
}

export interface ApiRateLimitInput {
    pathname: string;
    xForwardedFor: string | null;
    xRealIp: string | null;
}

export interface ApiRateLimitVerdict {
    /** The decision proxy.ts must act on. */
    allowed: boolean;
    /** Value for the `X-RateLimit-Limit` header. */
    limit: number;
    remaining: number;
    resetAt: number;
    /** Operator signal; proxy.ts logs it. Null in `legacy`/`enforce`. */
    warning: string | null;
}

export function evaluateApiRateLimit(input: ApiRateLimitInput): ApiRateLimitVerdict {
    const mode = getRateLimitMode();
    const routeClass = classifyRoute(input.pathname);
    const legacyLimit = limitFor(routeClass, 'path');

    if (mode === 'off') {
        return {
            allowed: true,
            limit: legacyLimit,
            remaining: legacyLimit,
            resetAt: Date.now() + PROXY_WINDOW_MS,
            warning: null,
        };
    }

    const { ip, legacyIp, spoofSuspected } = resolveClientIp(input.xForwardedFor, input.xRealIp);

    if (mode === 'legacy') {
        const legacy = checkRateLimit(`${legacyIp}:${input.pathname}`, legacyLimit, PROXY_WINDOW_MS);
        return { ...legacy, limit: legacyLimit, warning: null };
    }

    const scope = getRateLimitScope();
    const limit = limitFor(routeClass, scope);
    const key = scope === 'class' ? `v2:${routeClass}:${ip}` : `v2:${ip}:${input.pathname}`;

    if (mode === 'enforce') {
        const next = checkRateLimit(key, limit, PROXY_WINDOW_MS);
        return { ...next, limit, warning: null };
    }

    // report: run both, enforce the legacy one, surface the divergence.
    const legacy = checkRateLimit(`${legacyIp}:${input.pathname}`, legacyLimit, PROXY_WINDOW_MS);
    const next = checkRateLimit(key, limit, PROXY_WINDOW_MS);

    let warning: string | null = null;
    if (!next.allowed && legacy.allowed) {
        warning =
            `would block ${input.pathname} for ${ip} ` +
            `(${routeClass}/${scope}, limit ${limit}, caller sent x-forwarded-for=${legacyIp})`;
    } else if (spoofSuspected) {
        const now = Date.now();
        if (now - lastProvenanceLogAt >= PROXY_WINDOW_MS) {
            lastProvenanceLogAt = now;
            warning =
                `provenance sample on ${input.pathname}: trusted hop ${ip}, ` +
                `caller-supplied x-forwarded-for=${legacyIp} (hops=${getTrustedProxyHops()})`;
        }
    }

    return { ...legacy, limit: legacyLimit, warning };
}
