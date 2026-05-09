import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { blockIp } from '@/lib/gcp/armor';
import type { StorageConfig, SecurityReport } from '@/types';
import { logAuditEvent } from '@/lib/audit';

/**
 * Remediate security threats (Phase 146)
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
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        const { threatId, action } = await request.json();
        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];
        const report = storage.metadata?.securityReport as SecurityReport | undefined;

        if (!report) {
            return NextResponse.json({ success: false, error: 'No security report found' }, { status: 400 });
        }

        const threatIndex = report.activeThreats.findIndex(t => t.id === threatId);
        if (threatIndex === -1) {
            return NextResponse.json({ success: false, error: 'Threat not found' }, { status: 404 });
        }

        const threat = report.activeThreats[threatIndex];

        if (action === 'BLOCK_IP') {
            const policyName = project.cloudArmorPolicy || 'default-waf-policy';
            await blockIp(policyName, threat.sourceIp);
            threat.status = 'BLOCKED';
        } else if (action === 'DISMISS') {
            threat.status = 'DISMISSED';
        }

        storageConfigs[index] = storage;
        await updateProject(id, { storageConfigs });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'storage.security_remediate',
            { projectId: id, storageId, threatId, action, sourceIp: threat.sourceIp }
        );

        return NextResponse.json({ success: true, message: `Threat ${action === 'BLOCK_IP' ? 'blocked' : 'dismissed'}` });

    } catch (error) {
        console.error('[SecurityRemediationAPI] Error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
