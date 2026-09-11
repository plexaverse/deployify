import type { StorageConfig } from '@/types';

export interface SecurityRisk {
    id: string;
    level: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    remediation: string;
    /**
     * False when the platform cannot fix this automatically and an operator must act.
     * The UI should render it as informational rather than offering a FIX button.
     */
    actionable?: boolean;
}

export interface SecurityPosture {
    score: number; // 0-100
    risks: SecurityRisk[];
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    lastAuditedAt: string;
}

/**
 * Audit a storage connector's security posture based on its configuration and metadata
 */
export function checkSecurityPosture(
    storage: StorageConfig,
    projectRegion?: string | null,
    iamPosture?: { overprivileged: boolean; excessiveRoles: string[] }
): SecurityPosture {
    const risks: SecurityRisk[] = [];
    let score = 100;

    const type = storage.type;
    const metadata = storage.metadata || {};
    const isCloudSql = type.includes('cloud-sql');
    const isExternal = ['supabase', 'mongodb-atlas', 'planetscale', 'neon'].includes(type);

    // 0. Public Exposure Check (Critical)
    if (isCloudSql && metadata.publicIp && !metadata.authorizedNetworks) {
        risks.push({
            id: 'public_ip_exposed',
            level: 'critical',
            title: 'Public IP Exposure',
            description: 'This Cloud SQL instance has a public IP assigned with no authorized networks, potentially allowing unrestricted access.',
            remediation: 'Disable public IP or restrict access using Authorized Networks / Cloud SQL Auth Proxy.'
        });
        score -= 40;
    }

    // 1. SSL/TLS Enforcement Check
    if ((isCloudSql || isExternal || type === 'memorystore-redis') && !storage.ssl) {
        risks.push({
            id: 'unencrypted_connection',
            level: 'high',
            title: 'Unencrypted Connection',
            description: 'Transit encryption (SSL/TLS) is not enforced for this connector.',
            remediation: 'Enable the "SSL Required" toggle in connector settings.'
        });
        score -= 25;
    }

    // 2. Authentication Method Check (IAM vs Password)
    if (isCloudSql) {
        const isIamAuth = !!metadata.iamAuth || (storage.type.includes('cloud-sql') && !metadata.password);
        // Note: In our current implementation, we prefer IAM auth.
        // If it's not explicitly using IAM auth or has a password in metadata, flag it.
        if (!isIamAuth) {
            risks.push({
                id: 'password_auth_used',
                level: 'medium',
                title: 'Legacy Password Authentication',
                description: 'This instance is using static password authentication instead of IAM-based service account identity.',
                remediation: 'Switch to IAM-based authentication for improved security and automated rotation.'
            });
            score -= 15;
        } else if (!metadata.iamRoleVerified) {
            risks.push({
                id: 'iam_role_not_verified',
                level: 'high',
                title: 'Unverified IAM Configuration',
                description: 'IAM authentication is enabled but the required service account roles have not been verified.',
                remediation: 'Run a "Connection Diagnostic" to verify and grant the roles/cloudsql.instanceUser role.'
            });
            score -= 20;
        }
    }

    // 3. Deletion Protection Check
    if (isCloudSql && !metadata.deletionProtection) {
        risks.push({
            id: 'deletion_protection_disabled',
            level: 'medium',
            title: 'Deletion Protection Disabled',
            description: 'The Cloud SQL instance does not have deletion protection enabled.',
            remediation: 'Enable "Deletion Protection" in the provisioning settings to prevent accidental resource loss.'
        });
        score -= 10;
    }

    // 4. Regional Alignment Check
    const storageRegion = storage.region || (metadata.region as string);
    if (projectRegion && storageRegion && projectRegion !== storageRegion) {
        risks.push({
            id: 'regional_mismatch',
            level: 'low',
            title: 'Regional Alignment Mismatch',
            description: `The database is in ${storageRegion} while the service is in ${projectRegion}.`,
            remediation: 'Migrate the database to the same region as the service to reduce latency and egress costs.'
        });
        score -= 5;
    }

    // 5. Firewall Governance Check (External Connectors)
    if (isExternal && !metadata.firewallSynced) {
        risks.push({
            id: 'unmanaged_firewall',
            level: 'medium',
            title: 'Unmanaged Firewall Policy',
            description: 'This external connector does not have an automated firewall synchronization policy active.',
            remediation: 'Trigger a "Sync Status" operation to allowlist regional egress IPs in the provider firewall.'
        });
        score -= 15;
    }

    // 6. Production Tier Check (External Connectors)
    if (isExternal && storage.environment === 'production') {
        const tier = (metadata.tier as string || '').toUpperCase();
        const isFree = tier.includes('FREE') || tier.includes('HOBBY') || tier === 'M0' || tier === 'DEVELOPMENT';

        if (isFree) {
            risks.push({
                id: 'development_tier_in_production',
                level: 'medium',
                title: 'Non-Production Tier in Prod',
                description: `This connector is using a development/free tier (${tier || 'UNKNOWN'}) for a production environment.`,
                remediation: 'Upgrade to a professional/paid tier to ensure better availability and support.'
            });
            score -= 10;
        }
    }

    // 7. High Availability & PITR Check (Production Cloud SQL)
    if (isCloudSql && storage.environment === 'production') {
        if (!metadata.highAvailability) {
            risks.push({
                id: 'no_ha_in_production',
                level: 'high',
                title: 'Missing High Availability',
                description: 'This production Cloud SQL instance is not configured for High Availability (Regional).',
                remediation: 'Enable "High Availability" in instance settings to ensure failover capability across zones.'
            });
            score -= 15;
        }

        if (!metadata.pitrEnabled) {
            risks.push({
                id: 'no_pitr_in_production',
                level: 'high',
                title: 'PITR Disabled in Production',
                description: 'Point-in-Time Recovery (PITR) is disabled for this production database.',
                remediation: 'Enable "Point-in-Time Recovery" to allow restoration to any specific second in the recovery window.'
            });
            score -= 15;
        }

        // 8. Maintenance Window Alignment Check (Phase 118)
        if (metadata.maintenanceRecommendation && !metadata.maintenanceWindowSynced) {
            risks.push({
                id: 'maintenance_window_misalignment',
                level: 'low',
                title: 'Maintenance Misalignment',
                description: 'The Cloud SQL maintenance window is not aligned with your detected low-utilization patterns.',
                remediation: 'Use the "Align Window" remediation to synchronize maintenance with your dormant periods.'
            });
            score -= 5;
        }
    }

    // 9. Zero-Trust: Over-privileged Service Account (Phase 123)
    if (iamPosture?.overprivileged || metadata?.iamOverprivileged) {
        const roles = iamPosture?.excessiveRoles || (metadata?.excessiveRoles as string[]) || [];
        // Project-level roles on the SHARED platform service account cannot be revoked
        // automatically (see SELF_LOCKOUT_ROLES in iam.ts — stripping them breaks every
        // tenant). Once remediation has run and deferred the revoke, keep reporting the
        // posture but stop presenting it as a one-click fix, otherwise the button is a dead
        // loop: click, success toast, badge unchanged on the next sync.
        const deferred = !!metadata?.iamHardeningDeferred;
        risks.push({
            id: 'overprivileged_service_account',
            level: deferred ? 'medium' : 'critical',
            title: deferred
                ? 'Over-privileged Service Account (operator action required)'
                : 'Over-privileged Service Account',
            description: deferred
                ? `The shared platform service account holds project-level roles: ${roles.join(', ')}. Granular, resource-level access has been granted for this connector; removing the project-level roles is an operator action because the account is shared by every tenant.`
                : `The service account has excessive project-level roles: ${roles.join(', ')}. This violates Zero-Trust principles.`,
            remediation: deferred
                ? 'An operator must remove these roles from the shared platform service account, or opt specific roles into automated revocation via IAM_REMEDIATION_EXTRA_REVOCABLE_ROLES.'
                : 'Run "IAM Hardening" to revoke excessive roles and grant minimum required permissions.',
            ...(deferred ? { actionable: false } : {})
        });
        score -= deferred ? 10 : 30;
    }

    // 10. Zero-Trust: Broad Secret Access (Phase 124)
    if (metadata?.broadSecretAccess) {
        const deferred = !!metadata?.iamHardeningDeferred;
        risks.push({
            id: 'broad_secret_access',
            level: deferred ? 'medium' : 'high',
            title: deferred
                ? 'Broad Secret Manager Access (operator action required)'
                : 'Broad Secret Manager Access',
            description: deferred
                ? 'Granular, resource-level access has been granted for this connector\'s secrets. The shared platform service account still holds project-level Secret Manager roles; removing them is an operator action because every tenant depends on that account.'
                : 'The service account has broad access to all secrets in the project.',
            remediation: deferred
                ? 'An operator must remove the project-level Secret Manager roles from the shared platform service account.'
                : 'Restrict IAM permissions to only the specific secrets required by this connector.',
            ...(deferred ? { actionable: false } : {})
        });
        score -= deferred ? 5 : 20;
    }

    // 11. Public Access Risk (Simplified)
    // If it's external and no SSL, it's a high risk. We already caught SSL above,
    // but let's add a specific one for public exposure if we could detect it better.

    // Final Score Calculation
    score = Math.max(0, score);

    let grade: SecurityPosture['grade'] = 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';

    return {
        score,
        risks,
        grade,
        lastAuditedAt: new Date().toISOString()
    };
}
