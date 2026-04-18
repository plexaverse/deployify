import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';

export interface DiscoveredResource {
    id: string;
    name: string;
    type: 'cloud-sql' | 'firestore' | 'memorystore-redis' | 'supabase' | 'neon' | 'mongodb-atlas';
    region: string;
    status: string;
    isOrphaned?: boolean;
    metadata?: Record<string, string | number | boolean | undefined>;
}

/**
 * Discover existing database resources in a GCP project and external providers
 */
export async function discoverResources(
    projectId?: string, // GCP Project ID (Optional)
    activeBranchPatterns: string[] = [],
    deployifyProjectId?: string // Deployify Project ID to fetch external API keys
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
            },
            {
                id: 'orphan-db-pr-123',
                name: 'orphan-db-pr-123',
                type: 'cloud-sql',
                region: 'us-central1',
                status: 'RUNNABLE',
                isOrphaned: true,
                metadata: { databaseVersion: 'POSTGRES_15' }
            },
            {
                id: 'sb-external-proj',
                name: 'Supabase Main',
                type: 'supabase',
                region: 'us-east-1',
                status: 'ACTIVE'
            },
            {
                id: 'neon-dev-db',
                name: 'Neon Development',
                type: 'neon',
                region: 'aws-us-east-1',
                status: 'ACTIVE'
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
                    const isEphemeral = item.name.includes('-pr-') || item.name.includes('-branch-');
                    const isOrphaned = isEphemeral && activeBranchPatterns.length > 0 && !activeBranchPatterns.some(p => item.name.includes(p));

                    resources.push({
                        id: item.name,
                        name: item.name,
                        type: 'cloud-sql',
                        region: item.region,
                        status: item.state,
                        isOrphaned,
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
                    const isEphemeral = id.includes('-pr-') || id.includes('-branch-');
                    const isOrphaned = isEphemeral && activeBranchPatterns.length > 0 && !activeBranchPatterns.some(p => id.includes(p));

                    resources.push({
                        id,
                        name: id,
                        type: 'memorystore-redis',
                        region,
                        status: item.state,
                        isOrphaned,
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
                    const isEphemeral = id.includes('-pr-') || id.includes('-branch-');
                    const isOrphaned = isEphemeral && activeBranchPatterns.length > 0 && !activeBranchPatterns.some(p => id.includes(p));

                    resources.push({
                        id,
                        name: id,
                        type: 'firestore',
                        region: item.locationId,
                        status: 'READY', // Firestore doesn't provide a simple 'state' in this list
                        isOrphaned,
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

    // 4. Discover External Resources (Supabase, Neon)
    if (deployifyProjectId) {
        try {
            const { getProjectById } = await import('@/lib/db');
            const project = await getProjectById(deployifyProjectId);

            if (project && project.storageConfigs) {
                // Find unique API keys for each provider
                const supabaseKeys = Array.from(new Set(
                    project.storageConfigs
                        .filter(s => s.type === 'supabase' && s.metadata?.providerApiKey)
                        .map(s => s.metadata?.providerApiKey as string)
                ));

                const neonKeys = Array.from(new Set(
                    project.storageConfigs
                        .filter(s => s.type === 'neon' && s.metadata?.providerApiKey)
                        .map(s => s.metadata?.providerApiKey as string)
                ));

                const mongodbKeys = Array.from(new Set(
                    project.storageConfigs
                        .filter(s => s.type === 'mongodb-atlas' && s.metadata?.providerApiKey)
                        .map(s => ({
                            apiKey: s.metadata?.providerApiKey as string,
                            groupId: s.metadata?.groupId as string
                        }))
                ));

                // Discover from Supabase, Neon, and MongoDB Atlas in parallel
                await Promise.all([
                    ...supabaseKeys.map(async (apiKey) => {
                        try {
                            const sbRes = await fetch('https://api.supabase.com/v1/projects', {
                                headers: { Authorization: `Bearer ${apiKey}` }
                            });
                            if (sbRes.ok) {
                                const data = await sbRes.json();
                                (data || []).forEach((item: { id: string; name: string; region: string; status: string }) => {
                                    resources.push({
                                        id: item.id,
                                        name: item.name,
                                        type: 'supabase',
                                        region: item.region,
                                        status: item.status.toUpperCase()
                                    });
                                });
                            }
                        } catch (e) {
                            console.warn('[Discovery] Supabase discovery failed:', e);
                        }
                    }),
                    ...neonKeys.map(async (apiKey) => {
                        try {
                            const neonRes = await fetch('https://console.neon.tech/api/v2/projects', {
                                headers: { Authorization: `Bearer ${apiKey}` }
                            });
                            if (neonRes.ok) {
                                const data = await neonRes.json();
                                if (data.projects) {
                                    data.projects.forEach((item: { id: string; name: string; region_id: string }) => {
                                        resources.push({
                                            id: item.id,
                                            name: item.name,
                                            type: 'neon',
                                            region: item.region_id,
                                            status: 'ACTIVE'
                                        });
                                    });
                                }
                            }
                        } catch (e) {
                            console.warn('[Discovery] Neon discovery failed:', e);
                        }
                    }),
                    ...mongodbKeys.map(async ({ apiKey, groupId }) => {
                        try {
                            if (!groupId) return;
                            const mongoRes = await fetch(`https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters`, {
                                headers: {
                                    'Authorization': `Bearer ${apiKey}`,
                                    'Accept': 'application/json'
                                }
                            });
                            if (mongoRes.ok) {
                                const data = await mongoRes.json();
                                if (data.results) {
                                    data.results.forEach((item: { name: string; stateName: string; regionName: string }) => {
                                        resources.push({
                                            id: item.name,
                                            name: item.name,
                                            type: 'mongodb-atlas',
                                            region: item.regionName || 'UNKNOWN',
                                            status: item.stateName || 'ACTIVE',
                                            metadata: { groupId }
                                        });
                                    });
                                }
                            }
                        } catch (e) {
                            console.warn('[Discovery] MongoDB Atlas discovery failed:', e);
                        }
                    })
                ]);
            }
        } catch (e) {
            console.warn('[Discovery] External discovery failed:', e);
        }
    }

    return resources;
}
