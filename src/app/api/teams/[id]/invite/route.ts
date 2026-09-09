import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTeamById, getTeamMembership, createInvite } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { sendEmail } from '@/lib/email/client';
import { teamInviteEmail } from '@/lib/email/templates';
import { config } from '@/lib/config';
import { securityHeaders } from '@/lib/security';
import { canGrantRole, getInviteRoleGuardMode } from '@/lib/team-roles';
import { TeamRole } from '@/types';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const team = await getTeamById(id);

        if (!team) {
            return NextResponse.json(
                { error: 'Team not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        // Check if user is owner or admin
        const membership = await getTeamMembership(id, session.user.id);

        if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
            return NextResponse.json(
                { error: 'Forbidden. You must be an owner or admin to invite members.' },
                { status: 403, headers: securityHeaders }
            );
        }

        const body = await request.json();
        const { email, role = 'member' } = body;

        if (!email) {
            return NextResponse.json(
                { error: 'Email is required' },
                { status: 400, headers: securityHeaders }
            );
        }

        const validRoles = ['owner', 'admin', 'member', 'viewer'];
        if (!validRoles.includes(role)) {
             return NextResponse.json(
                { error: 'Invalid role' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Only an owner may hand out 'owner' - same rule the sibling PATCH endpoint
        // already enforces (src/app/api/teams/[id]/members/[userId]/route.ts). Without it
        // an admin can mint an owner-grade invite and redeem it (the token is in this
        // response body), escalating themselves past the role that gated them here.
        // No UI path can reach this branch: the invite SegmentedControl offers only
        // admin | member | viewer.
        if (!canGrantRole(membership.role, role as TeamRole)) {
            const guardMode = getInviteRoleGuardMode();
            console.error(
                `[TeamInvite] owner-grade invite by non-owner team=${id} requester=${session.user.id} ` +
                `requesterRole=${membership.role} invitedRole=${role} mode=${guardMode}`
            );
            if (guardMode === 'enforce') {
                await logAuditEvent(id, session.user.id, 'Member Invite Denied', {
                    email,
                    role,
                    reason: 'only-owners-can-invite-owners',
                }).catch(err => console.error('[TeamInvite] audit write failed:', err));

                return NextResponse.json(
                    { error: 'Forbidden. Only owners can invite members as owner.' },
                    { status: 403, headers: securityHeaders }
                );
            }
        }

        const token = crypto.randomUUID();
        const invite = await createInvite(id, email, role as TeamRole, session.user.id, token);

        const inviteUrl = `${config.appUrl}/join?token=${token}`;
        const { subject, html } = teamInviteEmail(team.name, inviteUrl);

        const emailResult = await sendEmail({
            to: email,
            subject,
            html,
        });

        if (!emailResult.success) {
            console.error('Failed to send invite email:', emailResult.error);
             return NextResponse.json(
                { error: 'Invite created but failed to send email' },
                { status: 500, headers: securityHeaders }
            );
        }

        await logAuditEvent(id, session.user.id, 'Member Invited', { email, role });

        return NextResponse.json(
            { invite },
            { status: 201, headers: securityHeaders }
        );
    } catch (error) {
        console.error('Error creating invite:', error);
        return NextResponse.json(
            { error: 'Failed to create invite' },
            { status: 500, headers: securityHeaders }
        );
    }
}
