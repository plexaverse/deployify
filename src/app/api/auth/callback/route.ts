import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCodeForToken, getGitHubUser, getGitHubUserEmail } from '@/lib/github';
import { createSessionToken } from '@/lib/auth';
import { upsertUser } from '@/lib/db';
import { config } from '@/lib/config';
import { logAuditEvent } from '@/lib/audit';

const COOKIE_NAME = 'deployify_session';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        // Handle OAuth errors
        if (error) {
            console.error('GitHub OAuth error:', error);
            return NextResponse.redirect(
                new URL(`/login?error=${error}`, config.appUrl)
            );
        }

        // Validate required params
        if (!code || !state) {
            return NextResponse.redirect(
                new URL('/login?error=missing_params', config.appUrl)
            );
        }

        // Verify CSRF state
        const cookieStore = await cookies();
        const storedState = cookieStore.get('oauth_state')?.value;

        if (!storedState || storedState !== state) {
            return NextResponse.redirect(
                new URL('/login?error=invalid_state', config.appUrl)
            );
        }

        // Exchange code for access token
        const accessToken = await exchangeCodeForToken(code);

        // Get user info from GitHub
        const githubUser = await getGitHubUser(accessToken);
        const email = await getGitHubUserEmail(accessToken);

        // Create or update user in database
        const user = await upsertUser({
            githubId: githubUser.id,
            githubUsername: githubUser.login,
            email: email,
            avatarUrl: githubUser.avatar_url,
            name: githubUser.name,
        });

        // Create session token
        const sessionToken = await createSessionToken(user, accessToken);

        await logAuditEvent(
            null,
            user.id,
            'user.login',
            {
                method: 'github',
                githubUsername: user.githubUsername
            }
        );

        // Create redirect response
        const response = NextResponse.redirect(new URL('/dashboard', config.appUrl));

        // On Cloud Run, NODE_ENV might not be 'production', so check appUrl instead
        const isSecure = config.appUrl.startsWith('https://');

        // Set session cookie on the response
        response.cookies.set(COOKIE_NAME, sessionToken, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60, // 7 days
        });

        // Delete the oauth_state cookie
        response.cookies.delete('oauth_state');

        return response;
    } catch (error) {
        console.error('GitHub callback error:', error);
        return NextResponse.redirect(
            new URL('/login?error=callback_failed', config.appUrl)
        );
    }
}

