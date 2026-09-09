import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getInviteByToken, acceptInvite, getTeamMembership } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';
import { getInviteAcceptGuardMode } from '@/lib/team-roles';

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

        // Backstop for owner-grade invites already written to Firestore before the
        // issue-time guard shipped. Dual-read: pre-fix invite docs carry no marker of the
        // inviter's authority, so we recompute it from the inviter's CURRENT membership.
        // Defaults to 'warn' (log only, today's behaviour) because a legitimately issued
        // owner invite can also fail this check if the inviting owner has since left.
        // Invites expire after 7 days, so the pre-fix backlog drains on its own.
        if (invite.role === 'owner') {
            const acceptGuardMode = getInviteAcceptGuardMode();
            const inviterMembership = await getTeamMembership(invite.teamId, invite.inviterId);
            if (inviterMembership?.role !== 'owner') {
                console.error(
                    `[InviteAccept] owner-grade invite whose inviter is not an owner ` +
                    `invite=${invite.id} team=${invite.teamId} inviter=${invite.inviterId} ` +
                    `inviterRole=${inviterMembership?.role ?? 'none'} mode=${acceptGuardMode}`
                );
                if (acceptGuardMode === 'enforce') {
                    await logAuditEvent(invite.teamId, session.user.id, 'Invite Rejected', {
                        inviteId: invite.id,
                        role: invite.role,
                        reason: 'inviter-not-owner',
                    }).catch(err => console.error('[InviteAccept] audit write failed:', err));

                    return NextResponse.json(
                        { error: 'This owner invite is no longer valid. Ask a team owner to re-send it.' },
                        { status: 403, headers: securityHeaders }
                    );
                }
            }
        }

        await acceptInvite(invite.id, session.user.id);

        await logAuditEvent(invite.teamId, session.user.id, 'Invite Accepted', { inviteId: invite.id });

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
