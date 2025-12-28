import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { config } from '@/lib/config';

export async function POST() {
    try {
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
        await clearSessionCookie();

        return NextResponse.redirect(new URL('/login', config.appUrl));
    } catch (error) {
        console.error('Logout error:', error);
        return NextResponse.redirect(new URL('/login', config.appUrl));
    }
}

