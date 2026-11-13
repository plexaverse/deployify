import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/auth';
import { revokeUserSessions } from '@/lib/session-revocation';
import { config } from '@/lib/config';

export async function POST() {
    try {
        // Deleting the cookie only stops THIS browser from sending the token; the token
        // itself stayed valid for its full 7 days. Revoke server-side as well, so "log out"
        // actually ends the session everywhere.
        const session = await getSession();
        if (session?.user?.id) {
            await revokeUserSessions(session.user.id);
        }

        await clearSessionCookie();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        return NextResponse.json(
            { success: false, error: 'Logout failed' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    // Check if this is an RSC prefetch - don't logout on prefetch!
    const isRscRequest = request.nextUrl.searchParams.has('_rsc');

    if (isRscRequest) {
        // Just return a redirect without clearing the cookie
        return NextResponse.redirect(new URL('/login', config.appUrl));
    }

    try {
        const session = await getSession();
        if (session?.user?.id) {
            await revokeUserSessions(session.user.id);
        }

        await clearSessionCookie();

        return NextResponse.redirect(new URL('/login', config.appUrl));
    } catch (error) {
        console.error('Logout error:', error);
        return NextResponse.redirect(new URL('/login', config.appUrl));
    }
}

