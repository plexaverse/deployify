import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTeamMembership, deleteTeam } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { securityHeaders } from '@/lib/security';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        // Check permission (only owner can delete team)
        const membership = await getTeamMembership(id, session.user.id);
        if (!membership || membership.role !== 'owner') {
             return NextResponse.json(
                { error: 'Forbidden. Only owners can delete teams.' },
                { status: 403, headers: securityHeaders }
            );
        }

        await deleteTeam(id);

        await logAuditEvent(id, session.user.id, 'Team Deleted', { teamId: id });

        return NextResponse.json(
            { success: true },
            { headers: securityHeaders }
        );

    } catch (error) {
        console.error('Error deleting team:', error);
        return NextResponse.json(
            { error: 'Failed to delete team' },
            { status: 500, headers: securityHeaders }
        );
    }
}
