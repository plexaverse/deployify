import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';

// Debug endpoint to check auth status
export async function GET(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('deployify_session');

        const session = await getSession();

        // Get all cookies for debugging
        const allCookies = cookieStore.getAll().map(c => ({
            name: c.name,
            hasValue: !!c.value,
            length: c.value?.length || 0,
        }));

        return NextResponse.json({
            hasSessionCookie: !!sessionCookie,
            sessionCookieLength: sessionCookie?.value?.length || 0,
            hasValidSession: !!session,
            sessionUser: session?.user?.githubUsername || null,
            allCookies,
            headers: {
                cookie: request.headers.get('cookie')?.substring(0, 100) + '...' || null,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : null,
        }, { status: 500 });
    }
}
