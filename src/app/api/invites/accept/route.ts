import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getInviteByToken, acceptInvite } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const body = await request.json();
        const { token } = body;

        if (!token) {
            return NextResponse.json(
                { error: 'Token is required' },
                { status: 400, headers: securityHeaders }
            );
        }

        const invite = await getInviteByToken(token);

        if (!invite) {
            return NextResponse.json(
                { error: 'Invalid or expired invite' },
                { status: 404, headers: securityHeaders }
            );
        }

        if (invite.expiresAt < new Date()) {
             return NextResponse.json(
                { error: 'Invite expired' },
                { status: 410, headers: securityHeaders }
            );
        }

        await acceptInvite(invite.id, session.user.id);

        // Log audit event
        await logAuditEvent(
            invite.teamId,
            session.user.id,
            session.user.name || session.user.email || 'Unknown User',
            'member.joined',
            {
                inviteId: invite.id,
                role: invite.role
            }
        );

        return NextResponse.json(
            { success: true },
            { headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error accepting invite:', error);
        return NextResponse.json(
            { error: 'Failed to accept invite' },
            { status: 500, headers: securityHeaders }
        );
    }
}
