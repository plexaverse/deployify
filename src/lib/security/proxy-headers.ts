/**
 * Header hygiene for the public tenant reverse proxy.
 *
 * The proxy serves tenant applications from Deployify's own origin, so the browser
 * attaches Deployify's first-party cookies to those requests. Forwarding them hands
 * the tenant — who controls the code at `project.productionUrl` — a live
 * `deployify_session` JWT, which embeds the user's GitHub access token.
 *
 * Tenant apps legitimately use their own cookies, so we strip only Deployify's own
 * cookie names and leave everything else untouched.
 */

/** Cookies owned by Deployify. Never forward these to a tenant origin. */
export const PLATFORM_COOKIE_NAMES = [
    'deployify_session',
    'oauth_state',
    'deployify_cli_context',
] as const;

/**
 * Remove Deployify's own cookies from a `Cookie` header value.
 * Returns null when nothing is left to send, so the caller can omit the header.
 */
export function stripPlatformCookies(cookieHeader: string | null | undefined): string | null {
    if (!cookieHeader) {
        return null;
    }

    const kept = cookieHeader
        .split(';')
        .map((pair) => pair.trim())
        .filter((pair) => {
            if (!pair) return false;
            const name = pair.split('=')[0].trim().toLowerCase();
            return !PLATFORM_COOKIE_NAMES.some((platform) => platform.toLowerCase() === name);
        });

    return kept.length > 0 ? kept.join('; ') : null;
}

/**
 * Build the outbound header set for a proxied request.
 *
 * `host`/`connection` are hop-by-hop and were already dropped before this change;
 * we additionally sanitize `cookie`. `authorization` is preserved, because tenant
 * apps use it for their own auth and Deployify never authenticates with it.
 */
export function buildProxyRequestHeaders(inbound: Headers): Headers {
    const headers = new Headers();

    inbound.forEach((value, key) => {
        const lower = key.toLowerCase();

        if (lower === 'host' || lower === 'connection') {
            return;
        }

        if (lower === 'cookie') {
            const safe = stripPlatformCookies(value);
            if (safe) {
                headers.set(key, safe);
            }
            return;
        }

        headers.set(key, value);
    });

    return headers;
}
