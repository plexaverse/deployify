/**
 * Edge Proxy (Middleware Replacement for Next.js 16)
 *
 * This file handles request interception, rate limiting, and security headers.
 * In Next.js 16, `proxy.ts` replaces `middleware.ts`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { config as appConfig } from '@/lib/config';

// Security headers to apply
const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// In-memory rate limit store (Edge-compatible)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
    identifier: string,
    limit: number = 100,
    windowMs: number = 60000
): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    if (!record || now > record.resetAt) {
        const resetAt = now + windowMs;
        rateLimitStore.set(identifier, { count: 1, resetAt });
        return { allowed: true, remaining: limit - 1, resetAt };
    }

    if (record.count >= limit) {
        return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count++;
    return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

// Routes that should be rate limited more strictly
const strictRateLimitRoutes = [
    '/api/auth/',
    '/api/webhooks/',
];

export async function proxy(request: NextRequest) {
    try {
        const { pathname } = request.nextUrl;
        const hostname = request.headers.get('host') || '';

        // Create a base response headers
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(securityHeaders)) {
            responseHeaders.set(key, value);
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

        // If it's a project subdomain, rewrite to the proxy
        if (subdomain && !['www', 'api', 'dashboard'].includes(subdomain)) {
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
            const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                request.headers.get('x-real-ip') ||
                'unknown';

            // Determine rate limit based on route
            const isStrictRoute = strictRateLimitRoutes.some(route => pathname.startsWith(route));
            const limit = isStrictRoute ? 30 : 100;

            const rateLimitResult = checkRateLimit(`${ip}:${pathname}`, limit);

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
            if (process.env.NODE_ENV === 'development') {
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
        console.error('Edge Proxy Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
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
