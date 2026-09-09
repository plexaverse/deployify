/**
 * Request-provenance guard (CSRF).
 *
 * Authentication on Deployify is ambient: `getSession()` reads the httpOnly
 * `deployify_session` cookie and `checkProjectAccess()` authorizes off it, so a
 * request forged by another page is indistinguishable from a real one. The
 * cookie is `SameSite=Lax`, which stops a *third-party* attacker, but tenant
 * apps are proxied at `<slug>.<app-domain>` — attacker-controlled HTML served
 * from a sibling subdomain is `same-site`, so Lax sends the cookie anyway.
 *
 * This module answers one question: "did a browser issue this request from an
 * origin we own?" It is deliberately a *deny-on-positive-evidence* check, not
 * an allow-list: we only reject when the browser itself tells us the request
 * came from somewhere else. Anything that carries no browser provenance at all
 * (the Deployify CLI, GitHub/Razorpay webhooks, Cloud Scheduler, curl,
 * server-to-server) is untouched, because those clients are not driven by an
 * attacker's page and cannot be made to carry someone else's cookies.
 *
 * NOTE: no node builtins in here. It is imported by `src/proxy.ts`.
 */
import { config } from '@/lib/config';

export type CsrfMode = 'off' | 'report' | 'enforce';

export type CsrfVerdict =
    | { allowed: true; reason: string }
    | { allowed: false; reason: string };

export interface RequestProvenance {
    method: string;
    pathname: string;
    origin: string | null;
    secFetchSite: string | null;
    secFetchMode: string | null;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Paths that are cross-origin *by contract*. Enforcing provenance on these
 * would break live traffic, so they are never checked.
 */
const EXEMPT_PATHS = [
    // Tenant reverse proxy: arbitrary tenant apps, arbitrary methods/origins.
    // (proxy.ts already returns early for subdomain hosts; this covers direct hits.)
    '/api/v1/proxy',
    // Public analytics collector. Responds with `Access-Control-Allow-Origin: *`
    // and authenticates on the `apiKey` in the body, not on the session cookie.
    '/api/v1/collect',
    // GitHub webhooks: HMAC-SHA256 signed, never carry an Origin.
    '/api/webhooks',
    // Razorpay webhook: signature verified, never carries an Origin.
    '/api/billing/webhook',
    // Cloud Scheduler / GitHub Actions: `Authorization: Bearer CRON_SECRET`.
    '/api/cron',
    // OAuth start — may legitimately be linked from docs, email, anywhere.
    '/api/auth/github',
    // OAuth return — a top-level navigation from github.com (`Sec-Fetch-Site: cross-site`).
    '/api/auth/callback',
] as const;

/**
 * Operating mode. Mirrors `getProxySsrfMode()` in `./ssrf`.
 *
 * Defaults to `report` (log only, zero behaviour change) so the guard can be
 * landed on a live system and observed before it starts rejecting anything.
 * Flip to `enforce` via env on the Cloud Run revision, then change this default.
 */
export function getCsrfMode(): CsrfMode {
    const raw = (process.env.CSRF_ORIGIN_MODE || '').trim().toLowerCase();
    if (raw === 'off' || raw === 'report' || raw === 'enforce') {
        return raw;
    }
    return 'report';
}

/**
 * Stage 3 opt-in: also check GET/HEAD/OPTIONS. Off by default — a handful of
 * GET handlers do mutate (`/api/projects/[id]/storage/[storageId]/sync`,
 * `/api/auth/logout`), but turning this on has a wider blast radius
 * (link-outs, RSC prefetches), so it ships dark.
 */
export function protectSafeMethods(): boolean {
    return (process.env.CSRF_PROTECT_SAFE_METHODS || '').trim().toLowerCase() === 'true';
}

function originOf(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

/**
 * Origins allowed to make credentialed cross-origin requests.
 *
 * This is only consulted when the browser reports a non-same-origin request,
 * so a misconfigured `NEXT_PUBLIC_APP_URL` can never lock out a modern browser
 * (those are approved earlier, on `Sec-Fetch-Site: same-origin`).
 */
export function getAllowedOrigins(): Set<string> {
    const allowed = new Set<string>();

    const appOrigin = originOf(config.appUrl);
    if (appOrigin) {
        allowed.add(appOrigin);
        // proxy.ts treats `www.<host>` as the base domain too, so accept both.
        try {
            const u = new URL(appOrigin);
            if (u.hostname.startsWith('www.')) {
                u.hostname = u.hostname.slice(4);
            } else {
                u.hostname = `www.${u.hostname}`;
            }
            allowed.add(u.origin);
        } catch {
            // ignore
        }
    }

    for (const extra of (process.env.CSRF_ALLOWED_ORIGINS || '').split(',')) {
        const trimmed = extra.trim();
        if (!trimmed) continue;
        const parsed = originOf(trimmed);
        if (parsed) allowed.add(parsed);
    }

    if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') {
        allowed.add('http://localhost:3000');
        allowed.add('http://127.0.0.1:3000');
    }

    return allowed;
}

export function isExemptPath(pathname: string): boolean {
    return EXEMPT_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Decide whether a request's provenance is acceptable.
 *
 * `Sec-Fetch-*` are forbidden header names: page JavaScript cannot set, spoof
 * or strip them, so when present they are authoritative. A non-browser client
 * *could* forge them, but a non-browser client has no ambient cookie jar to
 * abuse in the first place.
 */
export function checkRequestProvenance(req: RequestProvenance): CsrfVerdict {
    if (isExemptPath(req.pathname)) {
        return { allowed: true, reason: 'exempt-path' };
    }

    const method = (req.method || 'GET').toUpperCase();
    const isSafeMethod = SAFE_METHODS.has(method);

    if (isSafeMethod && !protectSafeMethods()) {
        return { allowed: true, reason: 'safe-method' };
    }

    const allowedOrigins = getAllowedOrigins();
    const site = req.secFetchSite?.trim().toLowerCase() || null;

    if (site) {
        if (site === 'same-origin' || site === 'none') {
            // 'none' == user-initiated (typed URL, bookmark). No initiating page.
            return { allowed: true, reason: `sec-fetch-site=${site}` };
        }

        // 'same-site' is the exploited case: a tenant app on <slug>.<app-domain>.
        // 'cross-site' is the classic case.
        if (req.origin && allowedOrigins.has(req.origin)) {
            return { allowed: true, reason: 'allowlisted-origin' };
        }

        if (isSafeMethod && req.secFetchMode?.trim().toLowerCase() === 'navigate') {
            // Top-level link-in. Not a credentialed subresource fetch.
            return { allowed: true, reason: 'top-level-navigation' };
        }

        return { allowed: false, reason: `sec-fetch-site=${site}` };
    }

    // No Sec-Fetch-Site: either a non-browser client or a pre-2020 browser.
    if (req.origin) {
        return allowedOrigins.has(req.origin)
            ? { allowed: true, reason: 'origin-match' }
            : { allowed: false, reason: `origin=${req.origin}` };
    }

    // Neither header. Every browser since ~2016 sends `Origin` on a cross-origin
    // POST/PUT/PATCH/DELETE, including plain <form> submissions, so the absence
    // of both headers means this is not a browser-forged request. This is the
    // branch that keeps the shipped CLI working: src/cli/index.js `fetchJson()`
    // sends `Cookie: deployify_session=<token>` and no browser headers at all.
    return { allowed: true, reason: 'no-browser-provenance' };
}
