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
    projectRegion?: string | null
): SecurityPosture {
    const risks: SecurityRisk[] = [];
    let score = 100;

    const type = storage.type;
    const metadata = storage.metadata || {};
    const isCloudSql = type.includes('cloud-sql');
    const isExternal = ['supabase', 'mongodb-atlas', 'planetscale', 'neon'].includes(type);

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
                remediation: 'Switch to IAM-based authentication for improved security and automated rotation. If connection fails, ensure roles/cloudsql.instanceUser is granted.'
            });
            score -= 15;
        } else if (storage.environment === 'production' && !storage.ssl) {
            // High risk: IAM auth without SSL in production
            risks.push({
                id: 'iam_without_ssl_prod',
                level: 'high',
                title: 'IAM Auth without SSL',
                description: 'IAM-based authentication is being used without enforced SSL in a production environment.',
                remediation: 'Enable "SSL Required" to ensure the IAM token is transmitted over an encrypted tunnel.'
            });
            // score reduction already handled by SSL check above
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

    // 7. Automated Backup Check (Cloud SQL)
    if (isCloudSql && storage.environment === 'production') {
        const hasBackups = metadata.backupsEnabled !== false; // Default to true for provisioned
        if (!hasBackups) {
            risks.push({
                id: 'backups_disabled_prod',
                level: 'high',
                title: 'Automated Backups Disabled',
                description: 'Automated backups are disabled for this production database.',
                remediation: 'Enable automated backups in the GCP console or storage settings to prevent data loss.'
            });
            score -= 20;
        }
    }

    // 8. Public Access Risk (Simplified)
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
