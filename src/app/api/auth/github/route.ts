import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createGitHubOAuthUrl, generateOAuthState } from '@/lib/auth';

export async function GET() {
    try {
        // Generate CSRF state token
        const state = generateOAuthState();

        // Store state in cookie for verification
        const cookieStore = await cookies();
        cookieStore.set('oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 10, // 10 minutes
            path: '/',
        });

        // Redirect to GitHub OAuth
        const authUrl = createGitHubOAuthUrl(state);

        return NextResponse.redirect(authUrl);
    } catch (error) {
        console.error('GitHub OAuth error:', error);
        return NextResponse.redirect(new URL('/login?error=oauth_failed', process.env.NEXT_PUBLIC_APP_URL));
    }
}
