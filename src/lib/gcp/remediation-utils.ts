import { updateProject } from '@/lib/db';
import { resolveManagedResourceName, UNBOUND_RESOURCE_ERROR, requireManagedResourceName } from '@/lib/gcp/resource-ownership';
import { updateInstanceSettings, updateConnectionPooler, migrateInstanceToRegion } from '@/lib/gcp/cloudsql';
import { syncExternalFirewall } from '@/lib/gcp/external-sync';
import { grantCloudSqlInstanceUserRole, revokeProjectRole, grantProjectRole, resolveRevocableRoles } from '@/lib/gcp/iam';
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
 * Every IAM grant/revoke below targets the SHARED platform service account in Deployify's
 * OWN GCP project, so the target must never be derived from tenant-writable connector
 * metadata (`storage.metadata.projectId` is merged straight out of the PATCH body).
 * Nothing in the product writes `metadata.projectId` for a storage connector, so pinning
 * it to the platform project is a no-op for real data.
 */
function resolvePlatformIamTarget(storage: StorageConfig): { gcpProjectId: string; saEmail: string } {
    const platformProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const requested = storage.metadata?.projectId;

    if (typeof requested === 'string' && requested && requested !== platformProjectId) {
        console.warn(`[IAMRemediation] Ignoring connector metadata.projectId="${requested}"; IAM mutations are pinned to the platform project.`);
    }

    const gcpProjectId = platformProjectId || (process.env.MOCK_DB === 'true' ? 'mock-project' : undefined);
    if (!gcpProjectId) {
        throw new Error('Platform GCP project is not configured; IAM remediation is unavailable.');
    }

    const saName = process.env.GCP_SERVICE_ACCOUNT_NAME || 'deployify-sa';
    return { gcpProjectId, saEmail: `${saName}@${gcpProjectId}.iam.gserviceaccount.com` };
}

/**
 * Project-level IAM *revocation* on the shared platform service account is a
 * platform-operator action, not a tenant action: a single revoke degrades every tenant.
 * Off by default; operators opt in with IAM_SELF_REMEDIATION_ENABLED=true once they have
 * confirmed the role allowlist matches their platform SA's real bindings.
 */
function isSelfRemediationEnabled(): boolean {
    return process.env.IAM_SELF_REMEDIATION_ENABLED === 'true';
}

/**
 * Performs remediation for a specific risk on a storage connector
 */
/**
 * Risks whose remediation mutates SHARED cloud state — the platform service account's IAM,
 * a Cloud SQL instance, firewall rules. These need owner/admin.
 *
 * Everything not listed here only writes a field on the connector's own Firestore document
 * (e.g. `unencrypted_connection` just sets storage.ssl = true), so a `member` — the default
 * role for every invited teammate — may still do it, matching every sibling storage route,
 * which gates viewers only.
 */
export const PRIVILEGED_REMEDIATION_RISKS: readonly string[] = [
    'deletion_protection_disabled',
    'no_ha_in_production',
    'no_pitr_in_production',
    'iam_role_not_verified',
    'connection_saturation_risk',
    'maintenance_window_misalignment',
    'overprivileged_service_account',
    'broad_secret_access',
    'public_ip_exposed',
    'password_auth_used',
    'regional_mismatch',
    'vpc_sc_violation'
];

/** True when this risk needs owner/admin rather than plain membership. */
export function requiresPrivilegedRole(riskId: string): boolean {
    return PRIVILEGED_REMEDIATION_RISKS.includes(riskId);
}

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

        // SECURITY: every GCP-mutating branch below resolves its target instance from the
        // connector. That must come from server-written metadata, never from the free-text
        // display name - otherwise a tenant names a connector after a victim's instance and
        // drives updateInstanceSettings (enable HA, flip deletion protection, restart the
        // pooler) against it in the shared platform project.
        const managedResourceName = resolveManagedResourceName(storageConfigs[index]);

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
                    if (!managedResourceName) {
                        return { success: false, message: UNBOUND_RESOURCE_ERROR, error: UNBOUND_RESOURCE_ERROR };
                    }
                    const instanceName = managedResourceName;
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
                    if (!managedResourceName) {
                        return { success: false, message: UNBOUND_RESOURCE_ERROR, error: UNBOUND_RESOURCE_ERROR };
                    }
                    const instanceName = managedResourceName;
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
                    if (!managedResourceName) {
                        return { success: false, message: UNBOUND_RESOURCE_ERROR, error: UNBOUND_RESOURCE_ERROR };
                    }
                    const instanceName = managedResourceName;
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
                    const { gcpProjectId, saEmail } = resolvePlatformIamTarget(storage);

                    const granted = await grantCloudSqlInstanceUserRole(gcpProjectId, saEmail);
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
                    if (!managedResourceName) {
                        return { success: false, message: UNBOUND_RESOURCE_ERROR, error: UNBOUND_RESOURCE_ERROR };
                    }
                    const instanceName = managedResourceName;
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
                    if (!managedResourceName) {
                        return { success: false, message: UNBOUND_RESOURCE_ERROR, error: UNBOUND_RESOURCE_ERROR };
                    }
                    const instanceName = managedResourceName;
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
                    const { gcpProjectId, saEmail } = resolvePlatformIamTarget(storage);

                    // Tenant-writable metadata may only *narrow* an operator-defined allowlist.
                    const { roles: revocableRoles, rejected } = resolveRevocableRoles(storage.metadata?.excessiveRoles);
                    if (rejected.length > 0) {
                        console.warn(`[IAMRemediation] Refusing to revoke non-allowlisted role(s) requested via connector metadata (project ${projectId}, connector ${storageId}): ${rejected.join(', ')}`);
                    }

                    const revokeEnabled = isSelfRemediationEnabled();

                    // 1. Revoke excessive roles (operator-gated: mutates the SHARED platform SA)
                    if (revokeEnabled) {
                        for (const role of revocableRoles) {
                            console.warn(`[IAMRemediation] Revoking ${role} from ${saEmail} in ${gcpProjectId} (project ${projectId}, connector ${storageId})`);
                            await revokeProjectRole(gcpProjectId, saEmail, role);
                        }
                    } else if (revocableRoles.length > 0) {
                        console.warn(`[IAMRemediation] IAM_SELF_REMEDIATION_ENABLED is not set; deferring revocation of ${revocableRoles.join(', ')} from ${saEmail} (project ${projectId}, connector ${storageId}).`);
                    }

                    // 2. Ensure minimal required roles are present (additive; cannot cause a DoS)
                    if (storage.type.includes('cloud-sql')) {
                        await grantProjectRole(gcpProjectId, saEmail, 'roles/cloudsql.client');
                    }

                    // 3. Phase 124: Use granular secret access instead of broad roles if possible
                    //    (resource-scoped to this connector's own secrets; always safe to run)
                    if (storage.connectionStringSecretId) {
                        await grantSecretAccess(storage.connectionStringSecretId, saEmail, gcpProjectId);
                    }
                    if (storage.providerApiKeySecretId) {
                        await grantSecretAccess(storage.providerApiKeySecretId, saEmail, gcpProjectId);
                    }

                    if (revokeEnabled) {
                        storage.metadata = {
                            ...storage.metadata,
                            iamOverprivileged: false,
                            excessiveRoles: [],
                            iamRoleVerified: true,
                            broadSecretAccess: false,
                            lastIamHardeningAt: new Date().toISOString()
                        };
                        message = 'IAM Hardening complete: Revoked excessive roles and enforced least-privilege with granular secret scoping.';
                    } else {
                        // Same response shape and status code; the next sync re-derives
                        // posture from live IAM, so nothing is silently marked "clean".
                        storage.metadata = {
                            ...storage.metadata,
                            iamRoleVerified: true,
                            iamHardeningDeferred: true,
                            lastIamHardeningAt: new Date().toISOString()
                        };
                        message = 'Granular secret scoping applied. Project-level role revocation on the shared platform service account is queued for operator review.';
                    }
                }
                break;

            case 'broad_secret_access':
                if (storage.metadata?.provisioned) {
                    const { gcpProjectId, saEmail } = resolvePlatformIamTarget(storage);

                    // 1. Grant granular access to this specific secret(s)
                    if (storage.connectionStringSecretId) {
                        await grantSecretAccess(storage.connectionStringSecretId, saEmail, gcpProjectId);
                    }
                    if (storage.providerApiKeySecretId) {
                        await grantSecretAccess(storage.providerApiKeySecretId, saEmail, gcpProjectId);
                    }

                    // 2. Revoke broad roles (operator-gated: mutates the SHARED platform SA;
                    //    dropping secretAccessor breaks secret reads for every tenant at once)
                    if (isSelfRemediationEnabled()) {
                        // Route through the same allowlist the overprivileged path uses instead of
                        // hardcoding role names, so NEVER_REVOKE_ROLES and operator overrides apply
                        // here too. Previously these two revokes bypassed resolveRevocableRoles
                        // entirely and could strip secret reads for every tenant at once.
                        const { roles: secretRoles, rejected: rejectedSecretRoles } = resolveRevocableRoles([
                            'roles/secretmanager.secretAccessor',
                            'roles/secretmanager.admin'
                        ]);
                        if (rejectedSecretRoles.length > 0) {
                            console.warn(`[IAMRemediation] Not revoking protected role(s) [${rejectedSecretRoles.join(', ')}] from ${saEmail}.`);
                        }

                        console.warn(`[IAMRemediation] Revoking broad Secret Manager roles [${secretRoles.join(', ') || 'none'}] from ${saEmail} in ${gcpProjectId} (project ${projectId}, connector ${storageId})`);
                        for (const role of secretRoles) {
                            await revokeProjectRole(gcpProjectId, saEmail, role);
                        }

                        storage.metadata = {
                            ...storage.metadata,
                            broadSecretAccess: secretRoles.length === 0 ? storage.metadata?.broadSecretAccess : false,
                            lastIamHardeningAt: new Date().toISOString()
                        };
                        message = secretRoles.length > 0
                            ? 'Secret access restricted to granular scope (resource-level).'
                            : 'Granular secret scoping applied. No project-level Secret Manager role was eligible for automatic revocation.';
                    } else {
                        console.warn(`[IAMRemediation] IAM_SELF_REMEDIATION_ENABLED is not set; deferring broad Secret Manager role revocation for ${saEmail} (project ${projectId}, connector ${storageId}).`);
                        storage.metadata = {
                            ...storage.metadata,
                            iamHardeningDeferred: true,
                            lastIamHardeningAt: new Date().toISOString()
                        };
                        message = 'Granular secret scoping applied. Project-level Secret Manager role revocation on the shared platform service account is queued for operator review.';
                    }
                }
                break;

            case 'public_ip_exposed':
                if (storage.type.includes('cloud-sql')) {
                    const instanceName = requireManagedResourceName(storage);
                    operationName = await updateInstanceSettings(instanceName, {
                        publicIpEnabled: false
                    });
                    storage.status = 'provisioning';
                    storage.metadata = {
                        ...storage.metadata,
                        operationName,
                        publicIpEnabled: false
                    };
                    message = 'Disabling public IP to enforce private IP networking...';
                }
                break;

            case 'password_auth_used':
                if (storage.type.includes('cloud-sql')) {
                    const instanceName = requireManagedResourceName(storage);
                    const dbType = storage.type.includes('postgres') ? 'postgres' : 'mysql';
                    operationName = await updateInstanceSettings(instanceName, {
                        iamAuthEnabled: true,
                        dbType
                    });
                    storage.status = 'provisioning';
                    storage.metadata = {
                        ...storage.metadata,
                        operationName,
                        iamAuthEnabled: true
                    };
                    message = 'Enabling IAM Database Authentication for passwordless access...';
                }
                break;

            case 'regional_mismatch':
                if (storage.type.includes('cloud-sql')) {
                    const instanceName = requireManagedResourceName(storage);
                    const projectRegion = project.region || config.gcp.region || 'asia-south1';

                    const result = await migrateInstanceToRegion(instanceName, projectRegion);

                    storage.status = 'provisioning';
                    const originalRegion = storage.region;
                    storage.region = projectRegion;
                    storage.metadata = {
                        ...storage.metadata,
                        operationName: result.operationName,
                        resourceName: result.targetInstanceName,
                        migratingFromRegion: originalRegion
                    };
                    message = 'Initiating instance clone migration to align with target region...';
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
