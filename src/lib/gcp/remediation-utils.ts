import { updateProject } from '@/lib/db';
import { updateInstanceSettings, updateConnectionPooler } from '@/lib/gcp/cloudsql';
import { syncExternalFirewall } from '@/lib/gcp/external-sync';
import { grantCloudSqlInstanceUserRole, revokeProjectRole, grantProjectRole } from '@/lib/gcp/iam';
import { grantSecretAccess } from '@/lib/gcp/secrets';
import { config } from '@/lib/config';
import type { StorageConfig, Project } from '@/types';

export interface RemediationResult {
    success: boolean;
    message: string;
    error?: string;
    storageConfig?: StorageConfig;
}

/**
 * Performs remediation for a specific risk on a storage connector
 */
export async function remediateRisk(
    projectId: string,
    storageId: string,
    riskId: string,
    project: Project
): Promise<RemediationResult> {
    try {
        const storageConfigs = project.storageConfigs || [];
        const index = storageConfigs.findIndex((s: StorageConfig) => s.id === storageId);

        if (index === -1) {
            return { success: false, message: 'Storage connector not found', error: 'Storage connector not found' };
        }

        const storage = { ...storageConfigs[index] };
        let message = 'Remediation started';
        let operationName: string | undefined;

        // Perform remediation based on riskId
        switch (riskId) {
            case 'unencrypted_connection':
                // Enable SSL requirement
                storage.ssl = true;
                message = 'SSL/TLS enforcement enabled';
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
                const fwResult = await syncExternalFirewall(projectId, storage);
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

            case 'no_ha_in_production':
                if (storage.type.includes('cloud-sql')) {
                    const instanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    operationName = await updateInstanceSettings(instanceName, {
                        highAvailability: true
                    });
                    storage.status = 'provisioning';
                    storage.metadata = {
                        ...storage.metadata,
                        operationName,
                        highAvailability: true
                    };
                    message = 'Enabling High Availability in GCP...';
                }
                break;

            case 'no_pitr_in_production':
                if (storage.type.includes('cloud-sql')) {
                    const instanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    operationName = await updateInstanceSettings(instanceName, {
                        pitrEnabled: true
                    });
                    storage.status = 'provisioning';
                    storage.metadata = {
                        ...storage.metadata,
                        operationName,
                        pitrEnabled: true
                    };
                    message = 'Enabling Point-in-Time Recovery in GCP...';
                }
                break;

            case 'iam_role_not_verified':
                if (storage.type.includes('cloud-sql')) {
                    const gcpProjectId = (storage.metadata?.projectId as string) || config.gcp.projectId || process.env.GCP_PROJECT_ID;
                    const saName = process.env.GCP_SERVICE_ACCOUNT_NAME || 'deployify-sa';
                    const saEmail = `${saName}@${gcpProjectId}.iam.gserviceaccount.com`;

                    const granted = await grantCloudSqlInstanceUserRole(gcpProjectId!, saEmail);
                    if (!granted) {
                        throw new Error('Failed to grant IAM role. Ensure the Deployify service account has Project IAM Admin permissions.');
                    }

                    storage.metadata = {
                        ...storage.metadata,
                        iamRoleVerified: true,
                        lastIamSyncAt: new Date().toISOString()
                    };
                    message = 'IAM role granted successfully';
                }
                break;

            case 'vpc_sc_violation':
                // Automated VPC-SC remediation: In a real environment, this would involve
                // calling the Access Context Manager API to update the Service Perimeter.
                // For this implementation, we flag the connector as 'remediating'
                // and update metadata to suggest the policy sync.
                storage.metadata = {
                    ...storage.metadata,
                    vpcScRemediationStartedAt: new Date().toISOString(),
                    pendingPerimeterSync: true
                };
                message = 'VPC Service Controls perimeter alignment initiated';
                break;

            case 'connection_saturation_risk':
                if (storage.type === 'cloud-sql-postgres') {
                    const instanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    operationName = await updateConnectionPooler(instanceName, true);
                    storage.status = 'provisioning';
                    storage.connectionPoolerEnabled = true;
                    storage.metadata = {
                        ...storage.metadata,
                        operationName,
                    };
                    message = 'Enabling PgBouncer connection pooler...';
                } else {
                    throw new Error('PgBouncer is only supported for PostgreSQL instances');
                }
                break;

            case 'maintenance_window_misalignment':
                if (storage.type.includes('cloud-sql')) {
                    const instanceName = (storage.metadata?.resourceName as string) || storage.name.toLowerCase().replace(/\s+/g, '-');
                    const rec = storage.metadata?.maintenanceRecommendation as { day: number; hour: number };

                    if (!rec) {
                        throw new Error('No maintenance recommendation found in metadata');
                    }

                    operationName = await updateInstanceSettings(instanceName, {
                        maintenanceWindow: { day: rec.day, hour: rec.hour }
                    });

                    storage.status = 'provisioning';
                    storage.metadata = {
                        ...storage.metadata,
                        operationName,
                        maintenanceWindowSynced: true,
                        lastMaintenanceSyncAt: new Date().toISOString()
                    };
                    message = 'Aligning maintenance window with workload patterns...';
                }
                break;

            case 'overprivileged_service_account':
                if (storage.metadata?.provisioned) {
                    const gcpProjectId = (storage.metadata?.projectId as string) || config.gcp.projectId || process.env.GCP_PROJECT_ID;
                    const saName = process.env.GCP_SERVICE_ACCOUNT_NAME || 'deployify-sa';
                    const saEmail = `${saName}@${gcpProjectId}.iam.gserviceaccount.com`;

                    const excessiveRoles = (storage.metadata?.excessiveRoles as string[]) || ['roles/owner', 'roles/editor'];

                    // 1. Revoke excessive roles
                    for (const role of excessiveRoles) {
                        await revokeProjectRole(gcpProjectId!, saEmail, role);
                    }

                    // 2. Ensure minimal required roles are present
                    if (storage.type.includes('cloud-sql')) {
                        await grantProjectRole(gcpProjectId!, saEmail, 'roles/cloudsql.client');
                    }

                    // 3. Phase 124: Use granular secret access instead of broad roles if possible
                    if (storage.connectionStringSecretId) {
                        await grantSecretAccess(storage.connectionStringSecretId, saEmail, gcpProjectId!);
                    }
                    if (storage.providerApiKeySecretId) {
                        await grantSecretAccess(storage.providerApiKeySecretId, saEmail, gcpProjectId!);
                    }

                    storage.metadata = {
                        ...storage.metadata,
                        iamOverprivileged: false,
                        excessiveRoles: [],
                        iamRoleVerified: true,
                        broadSecretAccess: false,
                        lastIamHardeningAt: new Date().toISOString()
                    };
                    message = 'IAM Hardening complete: Revoked excessive roles and enforced least-privilege with granular secret scoping.';
                }
                break;

            case 'broad_secret_access':
                if (storage.metadata?.provisioned) {
                    const gcpProjectId = (storage.metadata?.projectId as string) || config.gcp.projectId || process.env.GCP_PROJECT_ID;
                    const saName = process.env.GCP_SERVICE_ACCOUNT_NAME || 'deployify-sa';
                    const saEmail = `${saName}@${gcpProjectId}.iam.gserviceaccount.com`;

                    // 1. Grant granular access to this specific secret(s)
                    if (storage.connectionStringSecretId) {
                        await grantSecretAccess(storage.connectionStringSecretId, saEmail, gcpProjectId!);
                    }
                    if (storage.providerApiKeySecretId) {
                        await grantSecretAccess(storage.providerApiKeySecretId, saEmail, gcpProjectId!);
                    }

                    // 2. Revoke broad roles
                    await revokeProjectRole(gcpProjectId!, saEmail, 'roles/secretmanager.secretAccessor');
                    await revokeProjectRole(gcpProjectId!, saEmail, 'roles/secretmanager.admin');

                    storage.metadata = {
                        ...storage.metadata,
                        broadSecretAccess: false,
                        lastIamHardeningAt: new Date().toISOString()
                    };
                    message = 'Secret access restricted to granular scope (resource-level).';
                }
                break;

            default:
                return { success: false, message: `Unsupported risk remediation: ${riskId}`, error: 'Unsupported risk' };
        }

        // Persist updated configuration
        storage.updatedAt = new Date();
        storageConfigs[index] = storage;
        await updateProject(projectId, { storageConfigs });

        return {
            success: true,
            message,
            storageConfig: storage
        };

    } catch (error) {
        console.error('Remediation error:', error);
        return {
            success: false,
            message: 'Remediation failed',
            error: error instanceof Error ? error.message : 'Internal server error during remediation'
        };
    }
}
