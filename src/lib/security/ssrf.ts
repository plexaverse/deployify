import { isIP } from 'net';
import { lookup } from 'dns/promises';

/**
 * SSRF guard for the public tenant proxy (`/api/v1/proxy/[slug]/[[...path]]`).
 *
 * The proxy fetches a tenant's Cloud Run URL on behalf of an anonymous visitor and
 * forwards the visitor's headers verbatim. Because a tenant fully controls the app
 * that answers, the tenant also controls any `Location` header, so every hop after
 * the first must be re-validated against the internal network - most importantly the
 * GCP metadata server (169.254.169.254 / metadata.google.internal).
 */

export type SsrfMode = 'enforce' | 'report' | 'off';

export interface SsrfVerdict {
    safe: boolean;
    reason: string;
}

/** Thrown when a hop is rejected in `enforce` mode. */
export class ProxyTargetBlockedError extends Error {
    constructor(reason: string) {
        super(reason);
        this.name = 'ProxyTargetBlockedError';
    }
}

/**
 * Resolve the active policy.
 *
 * - `enforce` - block disallowed hops (default in production).
 * - `report`  - log only, follow the hop anyway (default outside production so that
 *               `next dev` against http://localhost:xxxx keeps working unchanged).
 * - `off`     - full kill switch: restores the pre-fix `redirect: 'follow'` behaviour.
 */
export function getProxySsrfMode(): SsrfMode {
    const raw = (process.env.PROXY_SSRF_MODE || '').trim().toLowerCase();
    if (raw === 'off' || raw === 'report' || raw === 'enforce') {
        return raw;
    }
    return process.env.NODE_ENV === 'production' ? 'enforce' : 'report';
}

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'metadata',
    'metadata.google.internal',
    'metadata.goog',
    'instance-data',
]);

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.internal', '.local'];

function parseIpv4(ip: string): number[] | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    const octets: number[] = [];
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        const n = Number(part);
        if (n > 255) return null;
        octets.push(n);
    }
    return octets;
}

/** True for any IPv4 address that must never be reachable from the proxy. */
export function isBlockedIpv4(ip: string): boolean {
    const octets = parseIpv4(ip);
    if (!octets) return true; // unparseable -> fail closed
    const [a, b] = octets;

    if (a === 0) return true;                             // 0.0.0.0/8   "this network"
    if (a === 10) return true;                            // 10/8        RFC1918
    if (a === 127) return true;                           // 127/8       loopback
    if (a === 169 && b === 254) return true;              // 169.254/16  link-local (GCP/AWS metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;     // 172.16/12   RFC1918
    if (a === 192 && b === 168) return true;              // 192.168/16  RFC1918
    if (a === 192 && b === 0) return true;                // 192.0.0/24  IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true;    // 100.64/10   CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15   benchmarking
    if (a >= 224) return true;                            // 224/4 multicast + 240/4 reserved + broadcast

    return false;
}

/** True for any IPv6 address that must never be reachable from the proxy. */
export function isBlockedIpv6(raw: string): boolean {
    const ip = raw.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').split('%')[0];

    if (ip === '::' || ip === '::1') return true;
    if (/^f[cd]/.test(ip)) return true;    // fc00::/7  unique local
    if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link local
    if (/^ff/.test(ip)) return true;       // ff00::/8  multicast

    // IPv4-mapped / IPv4-compatible in dotted form, e.g. ::ffff:169.254.169.254
    const dotted = ip.match(/:((?:\d{1,3}\.){3}\d{1,3})$/);
    if (dotted && isBlockedIpv4(dotted[1])) return true;

    // IPv4-mapped in hex form, e.g. ::ffff:a9fe:a9fe
    const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
        const hi = parseInt(hex[1], 16);
        const lo = parseInt(hex[2], 16);
        if (isBlockedIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`)) return true;
    }

    return false;
}

export function isBlockedIp(ip: string): boolean {
    const family = isIP(ip.replace(/^\[/, '').replace(/\]$/, '').split('%')[0]);
    if (family === 4) return isBlockedIpv4(ip);
    if (family === 6) return isBlockedIpv6(ip);
    return true; // not an IP literal -> caller should have resolved it first
}

// Small in-process TTL cache so the hot proxy path does not pay a DNS lookup per request.
const HOST_VERDICT_TTL_MS = 60_000;
const HOST_VERDICT_MAX = 2_000;
const hostVerdictCache = new Map<string, { verdict: SsrfVerdict; expiresAt: number }>();

/**
 * Decide whether the proxy may fetch `rawUrl`.
 *
 * DNS resolution errors fail OPEN (the subsequent `fetch` would fail the same way, so
 * failing closed would only convert a network error into a false-positive block), while
 * a hostname that successfully resolves to an internal address fails CLOSED.
 */
export async function checkProxyTarget(rawUrl: string): Promise<SsrfVerdict> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return { safe: false, reason: 'target is not a valid absolute URL' };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { safe: false, reason: `disallowed protocol "${url.protocol}"` };
    }

    if (url.username || url.password) {
        return { safe: false, reason: 'target URL carries embedded credentials' };
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname) {
        return { safe: false, reason: 'target URL has no hostname' };
    }

    if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_HOST_SUFFIXES.some(s => hostname.endsWith(s))) {
        return { safe: false, reason: `blocked hostname "${hostname}"` };
    }

    if (isIP(hostname.replace(/^\[/, '').replace(/\]$/, ''))) {
        return isBlockedIp(hostname)
            ? { safe: false, reason: `blocked internal address "${hostname}"` }
            : { safe: true, reason: 'ok' };
    }

    const cached = hostVerdictCache.get(hostname);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.verdict;
    }

    let verdict: SsrfVerdict;
    try {
        const records = await lookup(hostname, { all: true });
        const bad = records.find(r => isBlockedIp(r.address));
        verdict = bad
            ? { safe: false, reason: `hostname "${hostname}" resolves to internal address ${bad.address}` }
            : { safe: true, reason: 'ok' };
    } catch {
        // Resolver failure - do not turn a DNS outage into a proxy outage.
        return { safe: true, reason: 'dns lookup failed; allowed' };
    }

    if (hostVerdictCache.size >= HOST_VERDICT_MAX) {
        hostVerdictCache.clear();
    }
    hostVerdictCache.set(hostname, { verdict, expiresAt: Date.now() + HOST_VERDICT_TTL_MS });
    return verdict;
}

/** Test hook - clears the DNS verdict cache. */
export function resetProxyTargetCache(): void {
    hostVerdictCache.clear();
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20; // same ceiling undici/fetch uses for `redirect: 'follow'`

// Headers the WHATWG fetch spec strips when a redirect crosses an origin boundary.
const CROSS_ORIGIN_STRIP = ['authorization', 'cookie', 'cookie2', 'proxy-authorization', 'www-authenticate'];
// Headers the spec strips when a redirect downgrades the request to a bodyless GET.
const BODY_STRIP = ['content-encoding', 'content-language', 'content-length', 'content-location', 'content-type'];

function without(headers: Headers, names: string[]): Headers {
    const next = new Headers(headers);
    for (const name of names) next.delete(name);
    return next;
}

/**
 * Drop-in replacement for `fetch(url, { redirect: 'follow' })` that re-validates every
 * hop. Method/body/header rewriting mirrors the WHATWG redirect algorithm so that apps
 * which already worked under `redirect: 'follow'` behave identically.
 */
export async function fetchWithSsrfGuard(
    initialUrl: string,
    init: RequestInit,
    mode: SsrfMode = getProxySsrfMode()
): Promise<Response> {
    if (mode === 'off') {
        return fetch(initialUrl, { ...init, redirect: 'follow' });
    }

    const initialVerdict = await checkProxyTarget(initialUrl);
    if (!initialVerdict.safe) {
        console.error(`[Proxy SSRF] initial target rejected: ${initialVerdict.reason}`);
        if (mode === 'enforce') throw new ProxyTargetBlockedError(initialVerdict.reason);
    }

    let currentUrl = initialUrl;
    let method = (init.method || 'GET').toUpperCase();
    let body = init.body;
    let headers = new Headers(init.headers as HeadersInit | undefined);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const response = await fetch(currentUrl, { ...init, method, headers, body, redirect: 'manual' });

        if (!REDIRECT_STATUSES.has(response.status)) return response;

        const location = response.headers.get('location');
        if (!location) return response; // `follow` also surfaces a Location-less 3xx as-is

        let nextUrl: URL;
        try {
            nextUrl = new URL(location, currentUrl);
        } catch {
            return response;
        }

        const verdict = await checkProxyTarget(nextUrl.toString());
        if (!verdict.safe) {
            console.error(`[Proxy SSRF] redirect hop ${hop + 1} rejected: ${verdict.reason}`);
            if (mode === 'enforce') throw new ProxyTargetBlockedError(verdict.reason);
        }

        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
            if (method !== 'HEAD') method = 'GET';
            body = undefined;
            headers = without(headers, BODY_STRIP);
        }

        if (nextUrl.origin !== new URL(currentUrl).origin) {
            headers = without(headers, CROSS_ORIGIN_STRIP);
        }

        // Release the socket for the redirect response we are not returning.
        try {
            await response.body?.cancel();
        } catch {
            // ignore
        }

        currentUrl = nextUrl.toString();
    }

    // Matches what `redirect: 'follow'` does once the hop budget is exhausted.
    throw new TypeError('fetch failed: too many redirects');
}
