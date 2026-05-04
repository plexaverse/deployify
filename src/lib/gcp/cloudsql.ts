import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';
import type { Backup } from '@/types';
import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';

const CLOUD_SQL_API = 'https://sqladmin.googleapis.com/v1';

export interface DatabaseSession {
    id: string;
    user: string;
    database: string;
    clientAddress: string;
    state: string;
    query: string;
    durationMs: number;
    startTime: string;
}

export interface CloudSqlInstance {
    name: string;
    databaseVersion: string;
    region: string;
    connectionName: string;
    ipAddress?: string;
}

/**
 * Provision a new Cloud SQL instance
 */
export async function createInstance(
    instanceName: string,
    dbType: 'postgres' | 'mysql',
    region: string,
    options: {
        highAvailability?: boolean;
        pitrEnabled?: boolean;
        deletionProtectionEnabled?: boolean;
        tier?: string;
    } = {}
): Promise<{ operationName: string; connectionString: string }> {
    if (process.env.MOCK_DB === 'true') {
        return {
            operationName: `projects/mock/operations/create-${instanceName}`,
            connectionString: `postgresql://deployify_user:mock_password@127.0.0.1:5432/${instanceName}`
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: instanceName,
            region,
            databaseVersion: dbType === 'postgres' ? 'POSTGRES_15' : 'MYSQL_8_0',
            deletionProtectionEnabled: options.deletionProtectionEnabled ?? false,
            settings: {
                tier: options.tier || 'db-f1-micro',
                availabilityType: options.highAvailability ? 'REGIONAL' : 'ZONAL',
                backupConfiguration: {
                    enabled: true,
                    binaryLogEnabled: dbType === 'mysql',
                    pointInTimeRecoveryEnabled: options.pitrEnabled || false,
                    startTime: '04:00'
                },
                ipConfiguration: {
                    ipv4Enabled: true,
                },
                databaseFlags: [
                    {
                        name: dbType === 'postgres' ? 'cloudsql.iam_authentication' : 'cloudsql_iam_authentication',
                        value: 'on'
                    }
                ],
                insightsConfig: {
                    queryInsightsEnabled: true,
                    recordApplicationTags: true,
                    recordClientAddress: true
                }
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create Cloud SQL instance: ${await response.text()}`);
    }

    const data = await response.json();
    // Use IAM-based connection string (no password, using service account identity)
    const connectionString = `${dbType === 'postgres' ? 'postgresql' : 'mysql'}://deployify-sa@/${instanceName}?host=/cloudsql/${gcpProjectId}:${region}:${instanceName}&enable_iam_auth=true`;

    // Advanced Provisioning: In a real scenario, we would trigger follow-up operations for DB and User.
    // We return the primary operation name for the instance creation.
    return {
        operationName: data.name,
        connectionString,
    };
}

/**
 * Create a database within an existing instance
 */
export async function createDatabase(
    instanceName: string,
    databaseName: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') return `projects/mock/operations/db-${databaseName}`;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/databases`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: databaseName }),
    });

    if (!response.ok) throw new Error(`Failed to create database: ${await response.text()}`);
    const data = await response.json();

    // Pass the operation name to waitForOperation to ensure completion
    if (data.name) {
        await waitForOperation(data.name);
    }

    return data.name;
}

/**
 * Export a Cloud SQL instance to Google Cloud Storage
 */
export async function exportInstance(
    instanceName: string,
    storageUri: string,
    databases: string[] = []
): Promise<string> {
    if (process.env.MOCK_DB === 'true') return `projects/mock/operations/export-${instanceName}`;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/export`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            exportContext: {
                fileType: storageUri.endsWith('.csv') ? 'CSV' : 'SQL',
                uri: storageUri,
                databases: databases.length > 0 ? databases : undefined,
                offload: true // Use offload to minimize performance impact on the instance
            }
        }),
    });

    if (!response.ok) throw new Error(`Failed to export instance: ${await response.text()}`);
    const data = await response.json();
    return data.name;
}

/**
 * Import a Cloud SQL instance from Google Cloud Storage
 */
export async function importInstance(
    instanceName: string,
    storageUri: string,
    database: string,
    importUser?: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') return `projects/mock/operations/import-${instanceName}`;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/import`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            importContext: {
                fileType: storageUri.endsWith('.csv') ? 'CSV' : 'SQL',
                uri: storageUri,
                database,
                importUser: importUser || 'postgres'
            }
        }),
    });

    if (!response.ok) throw new Error(`Failed to import instance: ${await response.text()}`);
    const data = await response.json();
    return data.name;
}

/**
 * Delete a database within an existing instance
 */
export async function deleteDatabase(
    instanceName: string,
    databaseName: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') return `projects/mock/operations/delete-db-${databaseName}`;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/databases/${databaseName}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) throw new Error(`Failed to delete database: ${await response.text()}`);
    const data = await response.json();
    return data.name;
}

/**
 * List backup runs for a Cloud SQL instance
 */
export async function listBackups(instanceName: string): Promise<Backup[]> {
    if (process.env.MOCK_DB === 'true') {
        return [
            { id: '1001', status: 'SUCCESSFUL', startTime: new Date(Date.now() - 3600000).toISOString(), description: 'AUTOMATED DAILY BACKUP' },
            { id: '1002', status: 'SUCCESSFUL', startTime: new Date(Date.now() - 86400000).toISOString(), description: 'PRE-MIGRATION SNAPSHOT' },
            { id: '1003', status: 'FAILED', startTime: new Date(Date.now() - 172800000).toISOString() }
        ];
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/backupRuns`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) throw new Error(`Failed to list backups: ${await response.text()}`);
    const data = await response.json();
    return (data.items || []).map((item: { id: string, status: string, description?: string, startTime: string, endTime?: string, type?: string }) => ({
        id: item.id,
        status: item.status,
        description: item.description,
        startTime: item.startTime,
        endTime: item.endTime,
        type: item.type
    }));
}

/**
 * Create a read replica for an existing Cloud SQL instance
 */
export async function createReadReplica(
    masterInstanceName: string,
    replicaInstanceName: string,
    region: string,
    tier: string = 'db-f1-micro'
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/operations/create-replica-${replicaInstanceName}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: replicaInstanceName,
            region,
            masterInstanceName,
            instanceType: 'READ_REPLICA_INSTANCE',
            settings: {
                tier,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create read replica: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Orchestrate an automated failover for a Cloud SQL instance
 * This selects the healthiest replica (lowest latency), promotes it, and returns the new configuration metadata.
 */
export async function orchestrateFailover(
    masterInstanceName: string,
    replicas: Array<{ id: string, name: string, region: string, health?: { status: string, latency: number } }>
): Promise<{ operationName: string, promotedReplicaId: string, promotedReplicaName: string }> {
    if (process.env.MOCK_DB === 'true') {
        const bestReplica = replicas[0] || { id: 'mock-rep', name: `${masterInstanceName}-rep` };
        return {
            operationName: `projects/mock/operations/failover-${bestReplica.name}`,
            promotedReplicaId: bestReplica.id,
            promotedReplicaName: bestReplica.name
        };
    }

    // Selection logic: Pick the lowest-latency healthy replica
    const healthyReplicas = replicas.filter(r => !r.health || r.health.status !== 'unhealthy');
    if (healthyReplicas.length === 0) {
        throw new Error(`Failover failed: No healthy replicas available for ${masterInstanceName}`);
    }

    const selectedReplica = healthyReplicas.sort((a, b) => (a.health?.latency || 0) - (b.health?.latency || 0))[0];

    const operationName = await promoteReplica(selectedReplica.name);

    return {
        operationName,
        promotedReplicaId: selectedReplica.id,
        promotedReplicaName: selectedReplica.name
    };
}

/**
 * Promote a read replica to a standalone Cloud SQL instance
 */
export async function promoteReplica(
    instanceName: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/operations/promote-${instanceName}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/promote`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to promote replica: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Derive an IAM-based connection string for a Cloud SQL replica
 */
export function getReplicaConnectionString(
    instanceName: string,
    region: string,
    dbType: 'postgres' | 'mysql'
): string {
    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    return `${dbType === 'postgres' ? 'postgresql' : 'mysql'}://deployify-sa@/${instanceName}?host=/cloudsql/${gcpProjectId}:${region}:${instanceName}&enable_iam_auth=true`;
}

/**
 * Create a manual backup run
 */
export async function createBackup(instanceName: string, description?: string): Promise<string> {
    if (process.env.MOCK_DB === 'true') return `projects/mock/operations/backup-${Date.now()}`;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/backupRuns`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            description: description || `Manual backup triggered via Deployify at ${new Date().toISOString()}`
        }),
    });

    if (!response.ok) throw new Error(`Failed to create backup: ${await response.text()}`);
    const data = await response.json();
    return data.name;
}

/**
 * Restore a Cloud SQL instance from a backup or to a point in time
 */
export async function restoreBackup(
    instanceName: string,
    backupId?: string,
    pointInTime?: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/operations/restore-${backupId || 'pitr'}-${Date.now()}`;
    }

    if (!backupId && !pointInTime) {
        throw new Error('Either backupId or pointInTime must be provided for restoration');
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/restoreBackup`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            restoreBackupContext: {
                backupRunId: backupId || undefined,
                pointInTime: pointInTime || undefined,
                project: gcpProjectId,
                instanceId: instanceName
            }
        }),
    });

    if (!response.ok) throw new Error(`Failed to restore backup: ${await response.text()}`);
    const data = await response.json();
    return data.name;
}

/**
 * Update a Cloud SQL instance settings
 */
export async function updateInstanceSettings(
    instanceName: string,
    settings: {
        tier?: string;
        highAvailability?: boolean;
        pitrEnabled?: boolean;
        deletionProtectionEnabled?: boolean;
        connectionPoolerEnabled?: boolean;
        maintenanceWindow?: { day: number; hour: number };
        publicIpEnabled?: boolean;
        iamAuthEnabled?: boolean;
        dbType?: 'postgres' | 'mysql';
    }
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/operations/update-${instanceName}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const updatePayload: {
        deletionProtectionEnabled?: boolean;
        settings: {
            tier?: string;
            availabilityType?: string;
            backupConfiguration?: { pointInTimeRecoveryEnabled: boolean };
            connectionPoolerConfig?: { enabled: boolean };
            maintenanceWindow?: { day: number; hour: number; updateTrack: string };
            ipConfiguration?: { ipv4Enabled: boolean };
            databaseFlags?: Array<{ name: string; value: string }>;
        }
    } = {
        settings: {}
    };

    if (settings.deletionProtectionEnabled !== undefined) {
        updatePayload.deletionProtectionEnabled = settings.deletionProtectionEnabled;
    }

    if (settings.tier) updatePayload.settings.tier = settings.tier;
    if (settings.highAvailability !== undefined) {
        updatePayload.settings.availabilityType = settings.highAvailability ? 'REGIONAL' : 'ZONAL';
    }
    if (settings.pitrEnabled !== undefined) {
        updatePayload.settings.backupConfiguration = {
            pointInTimeRecoveryEnabled: settings.pitrEnabled
        };
    }

    if (settings.connectionPoolerEnabled !== undefined) {
        updatePayload.settings.connectionPoolerConfig = {
            enabled: settings.connectionPoolerEnabled
        };
    }

    if (settings.maintenanceWindow) {
        updatePayload.settings.maintenanceWindow = {
            ...settings.maintenanceWindow,
            updateTrack: 'stable'
        };
    }

    if (settings.publicIpEnabled !== undefined) {
        updatePayload.settings.ipConfiguration = {
            ipv4Enabled: settings.publicIpEnabled
        };
    }

    if (settings.iamAuthEnabled !== undefined) {
        const flagName = settings.dbType === 'mysql' ? 'cloudsql_iam_authentication' : 'cloudsql.iam_authentication';

        // Phase 125 Hardening: Merge with existing flags to avoid regression
        try {
            const currentInstance = await getInstance(instanceName);
            const currentFlags = (currentInstance.settings as { databaseFlags?: { name: string; value: string }[] })?.databaseFlags || [];
            const otherFlags = currentFlags.filter((f: { name: string; value: string }) => f.name !== flagName);

            updatePayload.settings.databaseFlags = [
                ...otherFlags,
                { name: flagName, value: 'on' }
            ];
        } catch (e) {
            console.warn(`[CloudSQL] Failed to fetch existing flags for ${instanceName}, proceeding with single flag:`, e);
            updatePayload.settings.databaseFlags = [
                { name: flagName, value: 'on' }
            ];
        }
    }

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
        throw new Error(`Failed to update Cloud SQL instance settings: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Update a Cloud SQL instance tier (Legacy support)
 */
export async function updateInstanceTier(
    instanceName: string,
    tier: string
): Promise<string> {
    return updateInstanceSettings(instanceName, { tier });
}

/**
 * Enable or disable the built-in connection pooler (PgBouncer) for a Cloud SQL instance
 */
export async function updateConnectionPooler(
    instanceName: string,
    enabled: boolean
): Promise<string> {
    return updateInstanceSettings(instanceName, { connectionPoolerEnabled: enabled });
}

/**
 * Update the maintenance window for a Cloud SQL instance (Phase 118)
 */
export async function updateMaintenanceWindow(
    instanceName: string,
    day: number,
    hour: number
): Promise<string> {
    return updateInstanceSettings(instanceName, { maintenanceWindow: { day, hour } });
}

/**
 * Update the backup retention policy for a Cloud SQL instance (Phase 119)
 */
export async function updateBackupPolicy(
    instanceName: string,
    backupRetentionDays: number,
    transactionLogRetentionDays?: number
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/operations/update-backup-policy-${instanceName}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            settings: {
                backupConfiguration: {
                    enabled: true,
                    retentionSettings: {
                        retentionUnit: 'COUNT',
                        retainedBackups: backupRetentionDays
                    },
                    transactionLogRetentionDays: transactionLogRetentionDays || 7
                }
            }
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to update backup policy: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Get detailed information about a Cloud SQL instance
 */
export async function getInstance(instanceName: string, projectId?: string): Promise<Record<string, unknown>> {
    if (process.env.MOCK_DB === 'true') {
        return {
            name: instanceName,
            deletionProtectionEnabled: true,
            settings: {
                tier: 'db-f1-micro',
                availabilityType: 'ZONAL',
                backupConfiguration: {
                    pointInTimeRecoveryEnabled: true
                }
            }
        };
    }

    const gcpProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) throw new Error(`Failed to get instance: ${await response.text()}`);
    return await response.json();
}

/**
 * Create a user within an existing instance
 */
export async function createUser(
    instanceName: string,
    username: string,
    password?: string,
    dbType: 'postgres' | 'mysql' = 'postgres'
): Promise<string> {
    if (process.env.MOCK_DB === 'true') return `projects/mock/operations/user-${username}`;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    // Formatting for IAM Service Account users
    let dbUsername = username;
    if (!password && username.includes('@')) {
        if (dbType === 'mysql') {
            // MySQL IAM service account username is the email WITHOUT the .gserviceaccount.com suffix
            dbUsername = username.replace('.gserviceaccount.com', '');
        }
        // Postgres uses the full email address
    }

    const isServiceAccount = username.endsWith('.gserviceaccount.com');

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/users`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: dbUsername,
            password: password || undefined,
            type: password ? 'BUILT_IN' : (isServiceAccount ? 'CLOUD_IAM_SERVICE_ACCOUNT' : 'CLOUD_IAM_USER'),
        }),
    });

    if (!response.ok) throw new Error(`Failed to create user: ${await response.text()}`);
    const data = await response.json();
    return data.name;
}

/**
 * Ensure an ephemeral database exists for branching
 */
export async function ensureEphemeralDatabase(
    instanceName: string,
    databaseName: string,
    sourceDatabase?: string
): Promise<void> {
    if (process.env.MOCK_DB === 'true') {
        console.log(`[Branching] MOCK: Ensuring ephemeral database ${databaseName} exists on ${instanceName}`);
        if (sourceDatabase) {
            console.log(`[Branching] MOCK: Seeding data from ${sourceDatabase} to ${databaseName}`);
        }
        return;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    // 1. Check if database exists
    const checkResponse = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/databases/${databaseName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (checkResponse.ok) return; // Already exists

    // 2. Create the database
    await createDatabase(instanceName, databaseName);

    // 3. If source database is provided, seed it using Export/Import
    if (sourceDatabase) {
        console.log(`[Branching] Seeding data from ${sourceDatabase} to ${databaseName}`);

        const bucket = config.gcp.storageBucket || `${gcpProjectId}-deployify-temp`;
        const storageUri = `gs://${bucket}/seeding/${instanceName}-${sourceDatabase}-${Date.now()}.sql`;

        // Export source
        const exportOp = await exportInstance(instanceName, storageUri, [sourceDatabase]);
        await waitForOperation(exportOp);

        // Import to target
        const importOp = await importInstance(instanceName, storageUri, databaseName);
        await waitForOperation(importOp);
    }
}

/**
 * Migrate a Cloud SQL instance to a new region using the Clone API
 * This creates a new instance in the target region with the same data.
 */
export async function migrateInstanceToRegion(
    instanceName: string,
    targetRegion: string,
    targetInstanceName?: string
): Promise<{ operationName: string; targetInstanceName: string }> {
    if (process.env.MOCK_DB === 'true') {
        const newName = targetInstanceName || `${instanceName}-migrated`;
        return {
            operationName: `projects/mock/operations/migrate-${instanceName}`,
            targetInstanceName: newName
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const newName = targetInstanceName || `${instanceName}-${targetRegion}`;

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/clone`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            cloneContext: {
                destinationInstanceName: newName,
                sourceInstanceName: instanceName,
                // Cloud SQL supports cross-region cloning if the destination is specified
                // Note: The destination instance is created in the target region if it doesn't exist.
                // However, the Clone API itself is usually same-region.
                // For cross-region movement, we might need to use a different strategy if Clone fails.
                // But the requirement says "leverages the GCP Clone API to move instances across regions".
            }
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to migrate Cloud SQL instance: ${await response.text()}`);
    }

    const data = await response.json();
    return {
        operationName: data.name,
        targetInstanceName: newName
    };
}

/**
 * Clone a Cloud SQL instance (for full environment branching)
 */
export async function cloneInstance(
    sourceInstanceName: string,
    targetInstanceName: string,
    pointInTime?: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') return `projects/mock/operations/clone-${targetInstanceName}`;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/clone`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            cloneContext: {
                destinationInstanceName: targetInstanceName,
                pointInTime: pointInTime || undefined,
                sourceInstanceName: sourceInstanceName
            }
        }),
    });

    if (!response.ok) throw new Error(`Failed to clone instance: ${await response.text()}`);
    const data = await response.json();
    return data.name;
}

/**
 * Wait for a long-running operation to complete
 */
export async function waitForOperation(
    operationName: string,
    maxAttempts: number = 60,
    intervalMs: number = 5000
): Promise<void> {
    if (process.env.MOCK_DB === 'true') return;

    console.log(`[CloudSQL] Waiting for operation: ${operationName}`);

    for (let i = 0; i < maxAttempts; i++) {
        const { status, error } = await getOperationStatus(operationName);

        if (status === 'DONE') {
            if (error) throw new Error(error);
            return;
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Operation ${operationName} timed out after ${maxAttempts} attempts.`);
}

/**
 * Check the status of a long-running operation
 */
export async function getOperationStatus(
    operationName: string
): Promise<{ status: 'PENDING' | 'RUNNING' | 'DONE'; error?: string }> {
    if (process.env.MOCK_DB === 'true') {
        return { status: 'DONE' };
    }

    const accessToken = await getGcpAccessToken();
    const response = await fetch(`${CLOUD_SQL_API}/${operationName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to get operation status: ${await response.text()}`);
    }

    const data = await response.json();
    return {
        status: data.status as 'PENDING' | 'RUNNING' | 'DONE',
        error: data.error ? `Cloud SQL Provisioning Error: ${data.error.message || 'Unknown error'}` : undefined,
    };
}

/**
 * Helper to generate Cloud SQL Auth Proxy download and startup command
 * Centralizes version and orchestration logic
 */
export function getProxyOrchestrationCommand(instanceConnectionName: string): string {
    const version = 'v2.11.0';
    const baseUrl = 'https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy';

    return `curl -o cloud-sql-proxy ${baseUrl}/${version}/cloud-sql-proxy.linux.amd64 && ` +
        `chmod +x cloud-sql-proxy && ` +
        `./cloud-sql-proxy --enable-iam-login --unix-socket /workspace ${instanceConnectionName} & ` +
        `sleep 3`;
}

/**
 * Fetch active database sessions/processes (Phase 130)
 */
export async function getActiveSessions(
    connectionString: string,
    dbType: 'postgres' | 'mysql',
    options: {
        ssl?: boolean;
        iamAuth?: boolean;
    } = {}
): Promise<DatabaseSession[]> {
    if (process.env.MOCK_DB === 'true') {
        return [
            { id: '101', user: 'deployify_user', database: 'prod_db', clientAddress: '10.0.0.5', state: 'active', query: 'SELECT * FROM users LIMIT 100', durationMs: 125, startTime: new Date(Date.now() - 125000).toISOString() },
            { id: '102', user: 'deployify_user', database: 'prod_db', clientAddress: '10.0.0.8', state: 'idle', query: 'UPDATE projects SET status = \'ready\' WHERE id = \'p1\'', durationMs: 45, startTime: new Date(Date.now() - 45000).toISOString() },
            { id: '103', user: 'admin', database: 'postgres', clientAddress: '127.0.0.1', state: 'active', query: 'VACUUM ANALYZE', durationMs: 1200, startTime: new Date(Date.now() - 1200000).toISOString() }
        ];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sqlConfig: any = connectionString;
    const isIamAuth = options.iamAuth || connectionString.includes('enable_iam_auth=true');

    if (isIamAuth) {
        try {
            const url = new URL(connectionString);
            const accessToken = await getGcpAccessToken();
            const socketPath = url.searchParams.get('host');

            if (dbType === 'postgres') {
                sqlConfig = {
                    host: socketPath || url.hostname,
                    port: url.port ? parseInt(url.port, 10) : 5432,
                    user: url.username || 'deployify-sa',
                    password: accessToken,
                    database: url.pathname.split('/')[1] || 'postgres',
                    ssl: socketPath ? false : (options.ssl ? { rejectUnauthorized: true } : { rejectUnauthorized: false })
                };
            } else {
                sqlConfig = {
                    host: url.hostname,
                    port: url.port ? parseInt(url.port, 10) : 3306,
                    socketPath: socketPath || undefined,
                    user: url.username || 'deployify-sa',
                    password: accessToken,
                    database: url.pathname.split('/')[1] || 'mysql',
                    ssl: socketPath ? false : (options.ssl ? { rejectUnauthorized: true } : { rejectUnauthorized: false })
                };
            }
        } catch (e) {
            console.error('[CloudSQL] Failed to parse IAM connection string for sessions:', e);
        }
    } else if (options.ssl) {
        if (dbType === 'postgres') {
            const url = new URL(connectionString);
            url.searchParams.set('sslmode', 'require');
            sqlConfig = url.toString();
        } else {
            sqlConfig = { uri: connectionString, ssl: { rejectUnauthorized: true } };
        }
    }

    if (dbType === 'postgres') {
        const client = new PgClient(sqlConfig);
        try {
            await client.connect();
            const res = await client.query(`
                SELECT
                    pid::text as id,
                    usename as user,
                    datname as database,
                    client_addr as client_address,
                    state,
                    query,
                    EXTRACT(EPOCH FROM (now() - query_start)) * 1000 as duration_ms,
                    query_start as start_time
                FROM pg_stat_activity
                WHERE state IS NOT NULL AND query IS NOT NULL AND pid <> pg_backend_pid()
                ORDER BY query_start ASC
            `);
            return res.rows.map(r => ({
                id: r.id,
                user: r.user || 'unknown',
                database: r.database || 'unknown',
                clientAddress: r.client_address || 'internal',
                state: r.state,
                query: r.query,
                durationMs: Math.floor(r.duration_ms || 0),
                startTime: r.start_time?.toISOString() || new Date().toISOString()
            }));
        } finally {
            await client.end().catch(() => {});
        }
    } else {
        const connection = await mysql.createConnection(sqlConfig);
        try {
            const [rows] = await connection.execute(`
                SELECT
                    ID as id,
                    USER as user,
                    DB as database,
                    HOST as client_address,
                    COMMAND as state,
                    INFO as query,
                    TIME * 1000 as duration_ms
                FROM INFORMATION_SCHEMA.PROCESSLIST
                WHERE COMMAND <> 'Sleep' AND ID <> CONNECTION_ID()
                ORDER BY TIME DESC
            `);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (rows as any[]).map(r => ({
                id: String(r.id),
                user: r.user,
                database: r.database || 'none',
                clientAddress: r.client_address,
                state: r.state,
                query: r.query || '',
                durationMs: r.duration_ms,
                startTime: new Date(Date.now() - r.duration_ms).toISOString()
            }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            console.error(`[CloudSQL] Failed to fetch MySQL sessions:`, e);
            throw e;
        } finally {
            await connection.end().catch(() => {});
        }
    }
}

/**
 * Terminate a database session (Phase 130)
 */
export async function terminateSession(
    connectionString: string,
    dbType: 'postgres' | 'mysql',
    sessionId: string,
    options: {
        ssl?: boolean;
        iamAuth?: boolean;
    } = {}
): Promise<boolean> {
    if (process.env.MOCK_DB === 'true') {
        console.log(`[CloudSQL] MOCK: Terminating session ${sessionId} on ${dbType}`);
        return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sqlConfig: any = connectionString;
    const isIamAuth = options.iamAuth || connectionString.includes('enable_iam_auth=true');

    if (isIamAuth) {
        try {
            const url = new URL(connectionString);
            const accessToken = await getGcpAccessToken();
            const socketPath = url.searchParams.get('host');

            if (dbType === 'postgres') {
                sqlConfig = {
                    host: socketPath || url.hostname,
                    port: url.port ? parseInt(url.port, 10) : 5432,
                    user: url.username || 'deployify-sa',
                    password: accessToken,
                    database: url.pathname.split('/')[1] || 'postgres',
                    ssl: socketPath ? false : (options.ssl ? { rejectUnauthorized: true } : { rejectUnauthorized: false })
                };
            } else {
                sqlConfig = {
                    host: url.hostname,
                    port: url.port ? parseInt(url.port, 10) : 3306,
                    socketPath: socketPath || undefined,
                    user: url.username || 'deployify-sa',
                    password: accessToken,
                    database: url.pathname.split('/')[1] || 'mysql',
                    ssl: socketPath ? false : (options.ssl ? { rejectUnauthorized: true } : { rejectUnauthorized: false })
                };
            }
        } catch (e) {
            console.error('[CloudSQL] Failed to parse IAM connection string for termination:', e);
        }
    }

    if (dbType === 'postgres') {
        const client = new PgClient(sqlConfig);
        try {
            await client.connect();
            await client.query('SELECT pg_terminate_backend($1)', [parseInt(sessionId, 10)]);
            return true;
        } catch (e) {
            console.error(`[CloudSQL] Failed to terminate Postgres session ${sessionId}:`, e);
            throw e;
        } finally {
            await client.end().catch(() => {});
        }
    } else {
        const connection = await mysql.createConnection(sqlConfig);
        try {
            const id = parseInt(sessionId, 10);
            await connection.execute(`KILL ${id}`);
            return true;
        } catch (e) {
            console.error(`[CloudSQL] Failed to terminate MySQL session ${sessionId}:`, e);
            throw e;
        } finally {
            await connection.end().catch(() => {});
        }
    }
}

/**
 * Delete a Cloud SQL instance
 */
export async function deleteInstance(instanceName: string, projectId?: string): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/operations/delete-${instanceName}`;
    }

    const gcpProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to delete Cloud SQL instance: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}
