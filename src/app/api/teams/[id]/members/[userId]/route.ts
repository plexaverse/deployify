import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTeamMembership, deleteTeamMembership, listTeamMembers, updateTeamMembership } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';

interface RouteParams {
    params: Promise<{ id: string; userId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id: teamId, userId: targetUserId } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        // Check requester permissions (must be owner or admin)
        const requesterMembership = await getTeamMembership(teamId, session.user.id);
        if (!requesterMembership || (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin')) {
             return NextResponse.json(
                { error: 'Forbidden. You must be an owner or admin to remove members.' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Get target membership
        const targetMembership = await getTeamMembership(teamId, targetUserId);
        if (!targetMembership) {
            return NextResponse.json(
                { error: 'Member not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        // Prevent removing self if it leaves no owners?
        // Or preventing removing self generally via this endpoint? Usually you "leave" team.
        // But an admin can remove another admin.
        // An admin cannot remove an owner.
        if (requesterMembership.role !== 'owner' && targetMembership.role === 'owner') {
             return NextResponse.json(
                { error: 'Forbidden. Admins cannot remove owners.' },
                { status: 403, headers: securityHeaders }
            );
        }

        // If removing an owner, check if it's the last owner
        if (targetMembership.role === 'owner') {
            const allMembers = await listTeamMembers(teamId);
            const owners = allMembers.filter(m => m.role === 'owner');
            if (owners.length <= 1) {
                 return NextResponse.json(
                    { error: 'Cannot remove the last owner. Promote another member to owner first.' },
                    { status: 400, headers: securityHeaders }
                );
            }
        }

        await deleteTeamMembership(targetMembership.id);

        await logAuditEvent(teamId, session.user.id, 'Member Removed', { removedUserId: targetUserId });

        return NextResponse.json(
            { success: true },
            { headers: securityHeaders }
        );

    } catch (error) {
        console.error('Error removing team member:', error);
        return NextResponse.json(
            { error: 'Failed to remove member' },
            { status: 500, headers: securityHeaders }
        );
    }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id: teamId, userId: targetUserId } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const body = await request.json();
        const { role } = body;

        const validRoles = ['owner', 'admin', 'member', 'viewer'];
        if (!role || !validRoles.includes(role)) {
            return NextResponse.json(
                { error: 'Invalid role' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Check requester permissions (owner/admin)
        const requesterMembership = await getTeamMembership(teamId, session.user.id);
        if (!requesterMembership || (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin')) {
             return NextResponse.json(
                { error: 'Forbidden. You must be an owner or admin to update roles.' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Admins cannot make someone owner (only owner can)
        if (role === 'owner' && requesterMembership.role !== 'owner') {
             return NextResponse.json(
                { error: 'Forbidden. Only owners can promote members to owner.' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Get target membership
        const targetMembership = await getTeamMembership(teamId, targetUserId);
        if (!targetMembership) {
            return NextResponse.json(
                { error: 'Member not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        // Admins cannot update owners
        if (targetMembership.role === 'owner' && requesterMembership.role !== 'owner') {
             return NextResponse.json(
                { error: 'Forbidden. Admins cannot update owners.' },
                { status: 403, headers: securityHeaders }
            );
        }

        // Prevent demoting last owner
        if (targetMembership.role === 'owner' && role !== 'owner') {
             const allMembers = await listTeamMembers(teamId);
             const owners = allMembers.filter(m => m.role === 'owner');
             if (owners.length <= 1) {
                  return NextResponse.json(
                     { error: 'Cannot demote the last owner.' },
                     { status: 400, headers: securityHeaders }
                 );
             }
        }

        await updateTeamMembership(targetMembership.id, { role });

        await logAuditEvent(teamId, session.user.id, 'Role Updated', { targetUserId, newRole: role });

        return NextResponse.json(
            { success: true, role },
            { headers: securityHeaders }
        );

    } catch (error) {
        console.error('Error updating member role:', error);
        return NextResponse.json(
            { error: 'Failed to update member role' },
            { status: 500, headers: securityHeaders }
        );
    }
}
