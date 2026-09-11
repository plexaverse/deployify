/**
 * Edge Proxy (Middleware Replacement for Next.js 16)
 *
 * This file handles request interception, rate limiting, and security headers.
 * In Next.js 16, `proxy.ts` replaces `middleware.ts`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cspHeader } from '@/lib/security/csp';
import { config as appConfig } from '@/lib/config';
import { trackError } from '@/lib/logging/tracker';
import { checkRequestProvenance, getCsrfMode } from '@/lib/security/csrf';
import { evaluateApiRateLimit } from '@/lib/security/rate-limit';

// Security headers to apply
const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Rate limiting lives in `@/lib/security/rate-limit` (edge-safe, no node
// builtins) so that the copy which actually runs here and the copy exported
// from `@/lib/security` cannot diverge again. Default mode is `legacy`:
// identical request outcomes to before, with the store now bounded.

export async function proxy(request: NextRequest) {
    try {
        const { pathname } = request.nextUrl;
        const hostname = request.headers.get('host') || '';

        // Create a base response headers
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(securityHeaders)) {
            responseHeaders.set(key, value);
        }
        // CSP ships Report-Only by default: the app has never run one, so a wrong directive
        // would blank panels with no actionable error. CSP_MODE=enforce to block.
        const csp = cspHeader();
        if (csp) {
            responseHeaders.set(csp.name, csp.value);
        }

        // 1. Detect Subdomain (Project Routing)
        const isLocalhost = hostname.includes('localhost');
        const parts = hostname.split('.');
        let subdomain = '';

        // Get base hostname from config for comparison
        let baseHostname = 'localhost';
        try {
            baseHostname = new URL(appConfig.appUrl).hostname;
        } catch {
            // Fallback or ignore
        }

        const isBaseDomain = hostname === baseHostname || hostname === `www.${baseHostname}`;

        if (!isBaseDomain) {
            if (isLocalhost) {
                // slug.localhost:3000 or localhost:3000
                if (parts.length > 1 && parts[0] !== 'localhost') {
                    subdomain = parts[0];
                }
            } else {
                // slug.deployify.io or slug.custom-domain.com
                // We check if it's a subdomain of our base domain
                if (hostname.endsWith(`.${baseHostname}`)) {
                    subdomain = hostname.replace(`.${baseHostname}`, '');
                } else if (parts.length > 2) {
                    // Fallback for other domains: assume first part is subdomain
                    subdomain = parts[0];
                }
            }
        }

        // Reserved subdomains that should never be proxied to a project
        const reservedSubdomains = ['test-ui', 'www', 'api', 'dashboard', 'new', 'login', 'join', 'settings', 'billing', 'invites', 'teams', 'user', 'edge-debug'];

        // If it's a project subdomain, rewrite to the proxy
        if (subdomain && !reservedSubdomains.includes(subdomain)) {
            // Check if we are trying to access the collector API or insights script - allow it to pass through
            if (pathname.startsWith('/api/v1/collect') || pathname.startsWith('/deployify-insights.js')) {
                return NextResponse.next({
                    headers: responseHeaders,
                });
            }

            const url = request.nextUrl.clone();
            url.pathname = `/api/v1/proxy/${subdomain}${pathname}`;
            return NextResponse.rewrite(url, {
                headers: responseHeaders,
            });
        }

        // Rate limiting for API routes
        if (pathname.startsWith('/api/')) {
            const rateLimitResult = evaluateApiRateLimit({
                pathname,
                xForwardedFor: request.headers.get('x-forwarded-for'),
                xRealIp: request.headers.get('x-real-ip'),
            });
            const limit = rateLimitResult.limit;

            if (rateLimitResult.warning) {
                console.warn(`[RateLimit] ${rateLimitResult.warning}`);
            }

            if (!rateLimitResult.allowed) {
                return NextResponse.json(
                    { error: 'Too many requests' },
                    {
                        status: 429,
                        headers: {
                            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
                            ...securityHeaders,
                            'X-RateLimit-Limit': limit.toString(),
                            'X-RateLimit-Remaining': '0',
                            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
                        }
                    }
                );
            }

            // Request-provenance (CSRF) guard.
            //
            // Every API handler authenticates purely on the ambient
            // `deployify_session` cookie. SameSite=Lax does not help us because
            // tenant apps are served from `<slug>.<app-domain>`, which is
            // same-site with the dashboard. Reject requests the browser itself
            // reports as coming from another origin.
            const csrfMode = getCsrfMode();
            if (csrfMode !== 'off') {
                const verdict = checkRequestProvenance({
                    method: request.method,
                    pathname,
                    origin: request.headers.get('origin'),
                    secFetchSite: request.headers.get('sec-fetch-site'),
                    secFetchMode: request.headers.get('sec-fetch-mode'),
                });

                if (!verdict.allowed) {
                    console.warn(
                        `[CSRF] ${csrfMode === 'enforce' ? 'blocked' : 'would block'} ` +
                        `${request.method} ${pathname} (${verdict.reason})`
                    );

                    if (csrfMode === 'enforce') {
                        return NextResponse.json(
                            { error: 'Forbidden' },
                            { status: 403, headers: securityHeaders }
                        );
                    }
                }
            }
        }

        // Apply security headers to all other responses
        const response = NextResponse.next();
        for (const [key, value] of Object.entries(securityHeaders)) {
            response.headers.set(key, value);
        }

        // Webhook route should skip auth check
        if (pathname === '/api/webhooks/github') {
            return response;
        }

        // Check authentication for protected dashboard routes
        if (pathname.startsWith('/dashboard') || pathname.startsWith('/new')) {
            const sessionCookie = request.cookies.get('deployify_session');
            const token = sessionCookie ? decodeURIComponent(sessionCookie.value) : '';

            // Allow logout to work in dev
            if (process.env.NODE_ENV === 'development' && token === 'deleted') {
                return NextResponse.redirect(new URL('/login', request.url));
            }

            // Bypass for local development
            if (process.env.NODE_ENV === 'development' || process.env.MOCK_DB === 'true') {
                return response;
            }

            const isRscRequest = request.nextUrl.searchParams.has('_rsc');

            if (!sessionCookie && !isRscRequest) {
                return NextResponse.redirect(new URL('/login', request.url));
            }

            if (!sessionCookie && isRscRequest) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        return response;
    } catch (error) {
        // Log to central error tracker
        await trackError({
            message: 'Edge Proxy Internal Error',
            error,
            path: request.nextUrl.pathname,
            method: request.method,
            metadata: {
                hostname: request.headers.get('host'),
                userAgent: request.headers.get('user-agent'),
            }
        });

        // Return generic error to user to avoid leaking system information
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: 'An unexpected error occurred while processing your request.'
            },
            { status: 500, headers: securityHeaders }
        );
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!favicon.ico|public/).*)',
    ],
};
