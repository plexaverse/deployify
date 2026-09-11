import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { remediateRisk, requiresPrivilegedRole } from '@/lib/gcp/remediation-utils';

/**
 * POST - One-Click Remediation for identified security risks
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const { riskId } = await request.json();

        if (!riskId) {
            return NextResponse.json({ success: false, error: 'Missing riskId' }, { status: 400 });
        }

        const access = await checkProjectAccess(session.user.id, id);
        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        // Viewers can never remediate, matching every sibling storage route.
        if (access.role === 'viewer') {
            return NextResponse.json(
                { success: false, error: 'Forbidden: Viewers cannot remediate infrastructure risks' },
                { status: 403 }
            );
        }

        // Only risks that mutate SHARED cloud state (platform SA IAM, Cloud SQL, firewall)
        // need owner/admin. Gating all of them locked out `member`, the default invite role,
        // even for risks that just flip a Firestore field.
        if (requiresPrivilegedRole(riskId) && access.role !== 'owner' && access.role !== 'admin') {
            return NextResponse.json(
                { success: false, error: 'Forbidden: Only owners and admins can remediate infrastructure risks' },
                { status: 403 }
            );
        }

        const result = await remediateRisk(id, storageId, riskId, access.project);

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error || result.message
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: result.message,
            storageConfig: result.storageConfig
        });

    } catch (error) {
        console.error('Remediation API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error during remediation'
        }, { status: 500 });
    }
}
