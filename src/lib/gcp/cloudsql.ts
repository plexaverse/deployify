import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';
import type { Backup } from '@/types';

const CLOUD_SQL_API = 'https://sqladmin.googleapis.com/v1';

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
    region: string
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
            settings: {
                tier: 'db-f1-micro',
                ipConfiguration: {
                    ipv4Enabled: true,
                },
                databaseFlags: [
                    { name: 'cloudsql.iam_authentication', value: 'on' }
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
 * Restore a Cloud SQL instance from a backup
 */
export async function restoreBackup(instanceName: string, backupId: string): Promise<string> {
    if (process.env.MOCK_DB === 'true') return `projects/mock/operations/restore-${backupId}`;

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
                backupRunId: backupId,
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
 * Update a Cloud SQL instance tier
 */
export async function updateInstanceTier(
    instanceName: string,
    tier: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/operations/update-${instanceName}`;
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
                tier,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to update Cloud SQL instance tier: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Create a user within an existing instance
 */
export async function createUser(
    instanceName: string,
    username: string,
    password?: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') return `projects/mock/operations/user-${username}`;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const response = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/users`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: username,
            password: password || undefined,
            type: password ? 'BUILT_IN' : 'CLOUD_IAM_USER',
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
    databaseName: string
): Promise<void> {
    if (process.env.MOCK_DB === 'true') return;

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    // 1. Check if database exists
    const checkResponse = await fetch(`${CLOUD_SQL_API}/projects/${gcpProjectId}/instances/${instanceName}/databases/${databaseName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (checkResponse.ok) return; // Already exists

    // 2. Create if not exists
    await createDatabase(instanceName, databaseName);
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
 * Delete a Cloud SQL instance
 */
export async function deleteInstance(instanceName: string): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/operations/delete-${instanceName}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
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
