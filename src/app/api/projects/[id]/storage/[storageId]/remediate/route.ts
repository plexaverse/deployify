import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { updateProject } from '@/lib/db';
import { updateInstanceSettings } from '@/lib/gcp/cloudsql';
import { syncExternalFirewall } from '@/lib/gcp/external-sync';
import type { StorageConfig } from '@/types';

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

        const { project } = access;
        const storageConfigs = project.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const storage = storageConfigs[index];
        let message = 'Remediation started';
        let operationName: string | undefined;

        // Perform remediation based on riskId
        switch (riskId) {
            case 'unencrypted_connection':
                // Enable SSL requirement
                storage.ssl = true;
                break;

            case 'deletion_protection_disabled':
                if (storage.type.includes('cloud-sql')) {
                    const instanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    operationName = await updateInstanceSettings(instanceName, {
                        deletionProtectionEnabled: true
                    });
                    storage.status = 'provisioning';
                    storage.metadata = {
                        ...storage.metadata,
                        operationName,
                        deletionProtection: true
                    };
                    message = 'Enabling deletion protection in GCP...';
                }
                break;

            case 'unmanaged_firewall':
                const fwResult = await syncExternalFirewall(id, storage);
                if (!fwResult.success) {
                    throw new Error(fwResult.error || 'Firewall sync failed');
                }
                storage.metadata = {
                    ...storage.metadata,
                    firewallSynced: true,
                    lastFirewallSyncAt: new Date().toISOString()
                };
                message = 'Firewall synchronization complete';
                break;

            default:
                return NextResponse.json({ success: false, error: `Unsupported risk remediation: ${riskId}` }, { status: 400 });
        }

        // Persist updated configuration
        storage.updatedAt = new Date();
        storageConfigs[index] = storage;
        await updateProject(id, { storageConfigs });

        return NextResponse.json({
            success: true,
            message,
            storageConfig: storage
        });

    } catch (error) {
        console.error('Remediation error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error during remediation'
        }, { status: 500 });
    }
}
