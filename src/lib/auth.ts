import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import type { User, Session } from '@/types';

const COOKIE_NAME = 'deployify_session';
const JWT_ALGORITHM = 'HS256';

// Encode secret for jose
const getSecret = () => new TextEncoder().encode(config.jwt.secret);

/**
 * Create a JWT session token
 */
export async function createSessionToken(user: User, accessToken: string): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days

    const token = await new SignJWT({
        sub: user.id,
        user: {
            id: user.id,
            githubId: user.githubId,
            githubUsername: user.githubUsername,
            email: user.email,
            avatarUrl: user.avatarUrl,
            name: user.name,
        },
        accessToken,
        expiresAt,
    })
        .setProtectedHeader({ alg: JWT_ALGORITHM })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(getSecret());

    return token;
}

/**
 * Verify and decode a JWT session token
 */
export async function verifySessionToken(token: string): Promise<Session | null> {
    try {
        const { payload } = await jwtVerify(token, getSecret(), {
            algorithms: [JWT_ALGORITHM],
        });

        // Check if token is expired
        if (payload.expiresAt && (payload.expiresAt as number) < Date.now() / 1000) {
            return null;
        }

        return {
            user: payload.user as User,
            accessToken: payload.accessToken as string,
            expiresAt: payload.expiresAt as number,
        };
    } catch {
        return null;
    }
}

/**
 * Get the current session from cookies
 */
export async function getSession(): Promise<Session | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
        return null;
    }

    return verifySessionToken(token);
}

/**
 * Set session cookie
 */
export async function setSessionCookie(token: string): Promise<void> {
    const cookieStore = await cookies();

    // On Cloud Run, NODE_ENV might not be 'production', so check appUrl instead
    const isSecure = config.appUrl.startsWith('https://');

    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
    });
}

/**
 * Clear session cookie (logout)
 */
export async function clearSessionCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
}

/**
 * Require authentication - returns session or redirects
 */
export async function requireAuth(): Promise<Session> {
    const session = await getSession();

    if (!session) {
        throw new Error('Unauthorized');
    }

    return session;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
    const session = await getSession();
    return session !== null;
}

/**
 * Generate OAuth state for CSRF protection
 */
export function generateOAuthState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Create GitHub OAuth URL
 */
export function createGitHubOAuthUrl(state: string): string {
    const params = new URLSearchParams({
        client_id: config.github.clientId,
        redirect_uri: `${config.appUrl}/api/auth/callback`,
        scope: 'repo read:user user:email',
        state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
}
