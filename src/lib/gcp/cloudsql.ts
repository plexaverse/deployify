import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

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

    // In a production scenario, we would now trigger another operation to create the DB and User
    // For this implementation, we assume the default 'postgres' or 'mysql' DB exists or will be created by the app.

    return {
        operationName: data.name,
        connectionString,
    };
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
        status: data.status,
        error: data.error?.message,
    };
}
