import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

export interface DiscoveredResource {
    id: string;
    name: string;
    type: 'cloud-sql' | 'firestore' | 'memorystore-redis';
    region: string;
    status: string;
    metadata?: Record<string, string | number | boolean | undefined>;
}

/**
 * Discover existing database resources in a GCP project
 */
export async function discoverResources(
    projectId?: string
): Promise<DiscoveredResource[]> {
    const targetProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;

    if (process.env.MOCK_DB === 'true') {
        return [
            {
                id: 'prod-db',
                name: 'Production SQL',
                type: 'cloud-sql',
                region: 'us-central1',
                status: 'RUNNABLE',
                metadata: { databaseVersion: 'POSTGRES_15' }
            },
            {
                id: 'cache-layer',
                name: 'Redis Cache',
                type: 'memorystore-redis',
                region: 'us-central1',
                status: 'READY',
                metadata: { memorySizeGb: 1 }
            },
            {
                id: '(default)',
                name: 'Default Firestore',
                type: 'firestore',
                region: 'us-central1',
                status: 'READY'
            }
        ];
    }

    if (!targetProjectId) {
        throw new Error('GCP Project ID is required for resource discovery');
    }

    const accessToken = await getGcpAccessToken();
    const resources: DiscoveredResource[] = [];

    // 1. Discover Cloud SQL Instances
    try {
        const sqlRes = await fetch(`https://sqladmin.googleapis.com/v1/projects/${targetProjectId}/instances`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (sqlRes.ok) {
            const data = await sqlRes.json();
            if (data.items) {
                data.items.forEach((item: { name: string; region: string; state: string; databaseVersion: string; connectionName: string }) => {
                    resources.push({
                        id: item.name,
                        name: item.name,
                        type: 'cloud-sql',
                        region: item.region,
                        status: item.state,
                        metadata: {
                            databaseVersion: item.databaseVersion,
                            connectionName: item.connectionName
                        }
                    });
                });
            }
        }
    } catch (e) {
        console.warn(`[Discovery] Failed to list Cloud SQL instances for ${targetProjectId}:`, e);
    }

    // 2. Discover Memorystore (Redis) Instances
    try {
        const redisRes = await fetch(`https://redis.googleapis.com/v1/projects/${targetProjectId}/locations/-/instances`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (redisRes.ok) {
            const data = await redisRes.json();
            if (data.instances) {
                data.instances.forEach((item: { name: string; state: string; memorySizeGb: number; redisVersion: string }) => {
                    const parts = item.name.split('/');
                    const id = parts[parts.length - 1];
                    const region = parts[parts.length - 3];
                    resources.push({
                        id,
                        name: id,
                        type: 'memorystore-redis',
                        region,
                        status: item.state,
                        metadata: {
                            memorySizeGb: item.memorySizeGb,
                            redisVersion: item.redisVersion
                        }
                    });
                });
            }
        }
    } catch (e) {
        console.warn(`[Discovery] Failed to list Memorystore instances for ${targetProjectId}:`, e);
    }

    // 3. Discover Firestore Databases
    try {
        const firestoreRes = await fetch(`https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (firestoreRes.ok) {
            const data = await firestoreRes.json();
            if (data.databases) {
                data.databases.forEach((item: { name: string; locationId: string; type: string }) => {
                    const parts = item.name.split('/');
                    const id = parts[parts.length - 1];
                    resources.push({
                        id,
                        name: id,
                        type: 'firestore',
                        region: item.locationId,
                        status: 'READY', // Firestore doesn't provide a simple 'state' in this list
                        metadata: {
                            type: item.type
                        }
                    });
                });
            }
        }
    } catch (e) {
        console.warn(`[Discovery] Failed to list Firestore databases for ${targetProjectId}:`, e);
    }

    return resources;
}
