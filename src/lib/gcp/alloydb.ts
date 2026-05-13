import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

const ALLOYDB_API = 'https://alloydb.googleapis.com/v1';

export interface AlloyDbCluster {
    name: string;
    displayName: string;
    uid: string;
    createTime: string;
    updateTime: string;
    state: string;
    clusterType: string;
    databaseVersion: string;
    network: string;
}

export interface AlloyDbInstance {
    name: string;
    displayName: string;
    uid: string;
    createTime: string;
    updateTime: string;
    state: string;
    instanceType: string;
    machineConfig: {
        cpuCount: number;
    };
    ipAddress: string;
}

/**
 * Provision a new AlloyDB Cluster
 */
export async function createCluster(
    clusterId: string,
    region: string,
    vpcNetwork: string
): Promise<{ operationName: string }> {
    if (process.env.MOCK_DB === 'true') {
        return {
            operationName: `projects/mock/locations/${region}/operations/create-cluster-${clusterId}`
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const parent = `projects/${gcpProjectId}/locations/${region}`;

    const response = await fetch(`${ALLOYDB_API}/${parent}/clusters?clusterId=${clusterId}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            network: `projects/${gcpProjectId}/global/networks/${vpcNetwork}`,
            initialUser: {
                password: Math.random().toString(36).slice(-12) // Initial password (we use IAM auth mainly)
            }
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create AlloyDB cluster: ${await response.text()}`);
    }

    const data = await response.json();
    return {
        operationName: data.name,
    };
}

/**
 * Create an AlloyDB Instance within a cluster
 */
export async function createInstance(
    clusterId: string,
    instanceId: string,
    region: string,
    tier: string = 'db-f1-micro' // AlloyDB tiers are different, but we'll map them or use defaults
): Promise<{ operationName: string }> {
    if (process.env.MOCK_DB === 'true') {
        return {
            operationName: `projects/mock/locations/${region}/operations/create-instance-${instanceId}`
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const parent = `projects/${gcpProjectId}/locations/${region}/clusters/${clusterId}`;

    // AlloyDB uses machine counts, e.g. 2, 4, 8 CPUs
    const cpuCount = tier.includes('small') ? 2 : (tier.includes('micro') ? 2 : 4);

    const response = await fetch(`${ALLOYDB_API}/${parent}/instances?instanceId=${instanceId}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            instanceType: 'PRIMARY',
            machineConfig: {
                cpuCount: cpuCount
            },
            databaseFlags: {
                "alloydb.iam_authentication": "on"
            }
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create AlloyDB instance: ${await response.text()}`);
    }

    const data = await response.json();
    return {
        operationName: data.name,
    };
}

/**
 * Get operation status
 */
export async function getOperationStatus(
    operationName: string
): Promise<{ status: 'PENDING' | 'RUNNING' | 'DONE'; error?: string }> {
    if (process.env.MOCK_DB === 'true' || operationName.includes('/mock/')) {
        return { status: 'DONE' };
    }

    const accessToken = await getGcpAccessToken();
    const response = await fetch(`${ALLOYDB_API}/${operationName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to get AlloyDB operation status: ${await response.text()}`);
    }

    const data = await response.json();

    // AlloyDB operations use the common Google operation pattern
    let status: 'PENDING' | 'RUNNING' | 'DONE' = 'RUNNING';
    if (data.done) {
        status = 'DONE';
    }

    return {
        status,
        error: data.error ? `AlloyDB Operation Error: ${data.error.message || 'Unknown error'}` : undefined,
    };
}

/**
 * Get AlloyDB Instance details
 */
export async function getInstance(
    clusterId: string,
    instanceId: string,
    region: string
): Promise<AlloyDbInstance> {
    if (process.env.MOCK_DB === 'true') {
        return {
            name: instanceId,
            displayName: instanceId,
            uid: 'mock-uid',
            createTime: new Date().toISOString(),
            updateTime: new Date().toISOString(),
            state: 'READY',
            instanceType: 'PRIMARY',
            machineConfig: { cpuCount: 2 },
            ipAddress: '10.0.0.10'
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/locations/${region}/clusters/${clusterId}/instances/${instanceId}`;

    const response = await fetch(`${ALLOYDB_API}/${name}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to get AlloyDB instance: ${await response.text()}`);
    }

    return await response.json();
}

/**
 * Delete AlloyDB instance
 */
export async function deleteInstance(
    clusterId: string,
    instanceId: string,
    region: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/locations/${region}/operations/delete-instance-${instanceId}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/locations/${region}/clusters/${clusterId}/instances/${instanceId}`;

    const response = await fetch(`${ALLOYDB_API}/${name}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to delete AlloyDB instance: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}

/**
 * Delete AlloyDB cluster
 */
export async function deleteCluster(
    clusterId: string,
    region: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return `projects/mock/locations/${region}/operations/delete-cluster-${clusterId}`;
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();
    const name = `projects/${gcpProjectId}/locations/${region}/clusters/${clusterId}`;

    const response = await fetch(`${ALLOYDB_API}/${name}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to delete AlloyDB cluster: ${await response.text()}`);
    }

    const data = await response.json();
    return data.name;
}
