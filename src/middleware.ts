import { NextRequest, NextResponse } from 'next/server';

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

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Apply security headers to all responses
    const response = NextResponse.next();

    for (const [key, value] of Object.entries(securityHeaders)) {
        response.headers.set(key, value);
    }

    // Rate limiting for API routes
    if (pathname.startsWith('/api/')) {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
            request.headers.get('x-real-ip') ||
            'unknown';

        // Determine rate limit based on route
        const isStrictRoute = strictRateLimitRoutes.some(route => pathname.startsWith(route));
        const limit = isStrictRoute ? 30 : 100; // 30 req/min for auth, 100 for others

        const rateLimitResult = checkRateLimit(`${ip}:${pathname}`, limit);

        // Add rate limit headers
        response.headers.set('X-RateLimit-Limit', limit.toString());
        response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
        response.headers.set('X-RateLimit-Reset', rateLimitResult.resetAt.toString());

        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { error: 'Too many requests' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
                        ...securityHeaders,
                    }
                }
            );
        }
    }

    // Webhook route should skip auth check but verify signature
    if (pathname === '/api/webhooks/github') {
        return response;
    }

    // Check authentication for protected dashboard routes
    // Only check if cookie EXISTS - layout will verify JWT validity
    if (pathname.startsWith('/dashboard')) {
        const sessionCookie = request.cookies.get('deployify_session');

        // For RSC prefetch requests, be more lenient
        const isRscRequest = request.nextUrl.searchParams.has('_rsc');

        if (!sessionCookie && !isRscRequest) {
            return NextResponse.redirect(new URL('/login', request.url));
        }

        // For RSC requests without cookie, let them through - layout handles it
        if (!sessionCookie && isRscRequest) {
            // Return 401 for RSC requests without auth
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|public/).*)',
    ],
};
