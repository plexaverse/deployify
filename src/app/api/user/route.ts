import { NextResponse } from 'next/server';
import { getSession, clearSessionCookie } from '@/lib/auth';
import { deleteUser } from '@/lib/db';

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ user: session.user, success: true });
}

export async function DELETE() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // In production, always delete user from DB.
        // In development, avoid deleting the built-in mock user to maintain session stability.
        const isProd = process.env.NODE_ENV === 'production';
        const isMockUser = session.user.id === 'audit-test';

        if (isProd || !isMockUser) {
            await deleteUser(session.user.id);
        }

        await clearSessionCookie();
        return NextResponse.json({ success: true, message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Failed to delete account:', error);
        return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }
}
