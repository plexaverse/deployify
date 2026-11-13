// CLI OAuth callback URL construction.
//
// The `port` value that ends up here originates in the query string of
// GET /api/auth/github (`?cli=true&port=<n>`) and is persisted in the
// `deployify_cli_context` cookie. It is therefore fully attacker-controlled.
//
// Interpolating it into `http://localhost:${port}/callback?token=...` lets a
// value such as `1@evil.com` push `localhost:1` into the URL *userinfo*
// component, making `evil.com` the real host and leaking the freshly minted
// session JWT (which also carries the GitHub access token) to the attacker.
//
// Everything below therefore treats `port` as untrusted: it must be a plain
// decimal port number, and the URL is assembled structurally via the URL API
// rather than by string interpolation.

// Loopback hosts we are willing to emit. Deliberately a fixed allowlist so
// DEPLOYIFY_CLI_CALLBACK_HOST can never be turned into an open redirect.
const ALLOWED_CLI_CALLBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;

const DEFAULT_CLI_CALLBACK_HOST = 'localhost';

/**
 * Host used for the CLI loopback redirect.
 *
 * Defaults to today's behaviour (`localhost`). DEPLOYIFY_CLI_CALLBACK_HOST may
 * override it, but only with another loopback host from the allowlist above.
 */
export function getCliCallbackHost(): string {
    const configured = process.env.DEPLOYIFY_CLI_CALLBACK_HOST?.trim();

    if (configured && (ALLOWED_CLI_CALLBACK_HOSTS as readonly string[]).includes(configured)) {
        return configured;
    }

    return DEFAULT_CLI_CALLBACK_HOST;
}

/**
 * Validate an untrusted CLI callback port.
 *
 * Returns the canonical decimal string (e.g. '54321') or null when the value is
 * not a usable TCP port. The shipped CLI passes `server.address().port`, so a
 * legitimate value is always 1-65535 decimal digits.
 */
export function normalizeCliCallbackPort(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }

    const raw = String(value).trim();

    // No '@', ':', '/', '\', '#', '?', whitespace, unicode digits, exponents,
    // signs — only ASCII digits, at most five of them.
    if (!/^[0-9]{1,5}$/.test(raw)) {
        return null;
    }

    const port = Number(raw);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return null;
    }

    return String(port);
}

/**
 * Build the CLI loopback callback URL, or null when the port is not valid.
 *
 * For a legitimate numeric port the output is byte-identical to the previous
 * template literal, so the shipped CLI (which reads `?token=` from
 * http://localhost:<port>/callback) is unaffected.
 */
export function buildCliCallbackUrl(port: unknown, sessionToken: string): string | null {
    const normalizedPort = normalizeCliCallbackPort(port);

    if (normalizedPort === null) {
        return null;
    }

    const url = new URL(`http://${getCliCallbackHost()}`);
    url.port = normalizedPort;
    url.pathname = '/callback';
    url.searchParams.set('token', sessionToken);

    return url.toString();
}
