import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTeamById, getTeamMembership, createInvite } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { sendEmail } from '@/lib/email/client';
import { teamInviteEmail } from '@/lib/email/templates';
import { config } from '@/lib/config';
import { securityHeaders } from '@/lib/security';
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

        // Log audit event
        await logAuditEvent(
            id,
            session.user.id,
            session.user.name || session.user.email || 'Unknown User',
            'member.invited',
            {
                email,
                role,
                inviteId: invite.id
            }
        );

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
