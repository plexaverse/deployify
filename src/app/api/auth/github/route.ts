import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createGitHubOAuthUrl, generateOAuthState } from '@/lib/auth';
import { config } from '@/lib/config';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const cli = searchParams.get('cli') === 'true';
        const port = searchParams.get('port');

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

        // Store CLI context if present
        if (cli && port) {
            cookieStore.set('deployify_cli_context', JSON.stringify({ cli, port }), {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 10, // 10 minutes
                path: '/',
            });
        }

        // Redirect to GitHub OAuth
        const authUrl = createGitHubOAuthUrl(state);

        return NextResponse.redirect(authUrl);
    } catch (error) {
        console.error('GitHub OAuth error:', error);
        return NextResponse.redirect(new URL('/login?error=oauth_failed', config.appUrl));
    }
}
