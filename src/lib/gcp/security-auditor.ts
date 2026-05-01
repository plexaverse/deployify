import type { StorageConfig } from '@/types';

export interface SecurityRisk {
    id: string;
    level: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    remediation: string;
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
        risks.push({
            id: 'overprivileged_service_account',
            level: 'critical',
            title: 'Over-privileged Service Account',
            description: `The service account has excessive project-level roles: ${roles.join(', ')}. This violates Zero-Trust principles.`,
            remediation: 'Run "IAM Hardening" to revoke excessive roles and grant minimum required permissions.'
        });
        score -= 30;
    }

    // 10. Zero-Trust: Broad Secret Access (Phase 123)
    if (metadata?.broadSecretAccess) {
        risks.push({
            id: 'broad_secret_access',
            level: 'high',
            title: 'Broad Secret Manager Access',
            description: 'The service account has broad access to all secrets in the project.',
            remediation: 'Restrict IAM permissions to only the specific secrets required by this connector.'
        });
        score -= 20;
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
