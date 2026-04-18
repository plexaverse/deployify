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
                remediation: 'Switch to IAM-based authentication for improved security and automated rotation.'
            });
            score -= 15;
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
            id: 'unmanaged_firewall_policy',
            level: 'medium',
            title: 'Unmanaged Firewall Policy',
            description: 'Firewall synchronization is not active or has not been verified for this external connector.',
            remediation: 'Trigger a manual "Sync" to authorize the latest regional egress IPs in your provider firewall.'
        });
        score -= 15;
    }

    // 6. Public Access Risk (Simplified)
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
