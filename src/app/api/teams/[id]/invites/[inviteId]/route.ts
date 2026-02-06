import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTeamMembership, deleteInvite, getInviteById } from '@/lib/db';
import { securityHeaders } from '@/lib/security';

interface RouteParams {
    params: Promise<{ id: string; inviteId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id: teamId, inviteId } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        // Check requester permissions (owner/admin)
        const membership = await getTeamMembership(teamId, session.user.id);
        if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
             return NextResponse.json(
                { error: 'Forbidden. You must be an owner or admin to revoke invites.' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Verify invite belongs to team
        const invite = await getInviteById(inviteId);
        if (!invite) {
             return NextResponse.json(
                { error: 'Invite not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        if (invite.teamId !== teamId) {
             return NextResponse.json(
                { error: 'Invite does not belong to this team' },
                { status: 400, headers: securityHeaders }
            );
        }

        await deleteInvite(inviteId);

        return NextResponse.json(
            { success: true },
            { headers: securityHeaders }
        );

    } catch (error) {
        console.error('Error revoking invite:', error);
        return NextResponse.json(
            { error: 'Failed to revoke invite' },
            { status: 500, headers: securityHeaders }
        );
    }
}
