import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';
import { getSecretValue } from './secrets';
import { classifyOrphan, classifyOrphanLegacy, isLegacyOrphanDetection } from './orphan-detection';
import type { OrphanCandidate, OrphanContext } from './orphan-detection';

export interface DiscoveredResource {
    id: string;
    name: string;
    type: 'cloud-sql' | 'firestore' | 'memorystore-redis' | 'supabase' | 'neon' | 'mongodb-atlas';
    region: string;
    status: string;
    isOrphaned?: boolean;
    /** Why the resource was (or was not) flagged. Additive; safe to ignore. */
    orphanReason?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
}

/**
 * Discover existing database resources in a GCP project and external providers
 */
export async function discoverResources(
    projectId?: string, // GCP Project ID (Optional)
    activeBranchPatterns: string[] = [],
    deployifyProjectId?: string, // Deployify Project ID to fetch external API keys
    orphanContext?: OrphanContext // Provenance for orphan classification (see orphan-detection.ts)
): Promise<DiscoveredResource[]> {
    const targetProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;

    // Orphan classification. Without a context we cannot prove anything, so strict mode
    // flags nothing; legacy mode keeps the old substring heuristic verbatim.
    const classify = (candidate: OrphanCandidate) => {
        if (orphanContext) return classifyOrphan(candidate, orphanContext);
        if (isLegacyOrphanDetection()) return classifyOrphanLegacy(candidate.name, activeBranchPatterns);
        return { orphaned: false, reason: 'Provenance unavailable' };
    };

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
                data.items.forEach((item: { name: string; region: string; state: string; databaseVersion: string; connectionName: string; settings?: { userLabels?: Record<string, string> } }) => {
                    const metadata = {
                        databaseVersion: item.databaseVersion,
                        connectionName: item.connectionName,
                        deployifyProjectId: item.settings?.userLabels?.['deployify-project-id'],
                        managedBy: item.settings?.userLabels?.['managed-by']
                    };
                    const verdict = classify({ id: item.name, name: item.name, type: 'cloud-sql', metadata });

                    resources.push({
                        id: item.name,
                        name: item.name,
                        type: 'cloud-sql',
                        region: item.region,
                        status: item.state,
                        isOrphaned: verdict.orphaned,
                        orphanReason: verdict.reason,
                        metadata
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
                data.instances.forEach((item: { name: string; state: string; memorySizeGb: number; redisVersion: string; labels?: Record<string, string> }) => {
                    const parts = item.name.split('/');
                    const id = parts[parts.length - 1];
                    const region = parts[parts.length - 3];
                    const metadata = {
                        memorySizeGb: item.memorySizeGb,
                        redisVersion: item.redisVersion,
                        deployifyProjectId: item.labels?.['deployify-project-id'],
                        managedBy: item.labels?.['managed-by']
                    };
                    const verdict = classify({ id, name: id, type: 'memorystore-redis', metadata });

                    resources.push({
                        id,
                        name: id,
                        type: 'memorystore-redis',
                        region,
                        status: item.state,
                        isOrphaned: verdict.orphaned,
                        orphanReason: verdict.reason,
                        metadata
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
                    // The Firestore v1 databases API exposes no labels, so provenance can
                    // never be proven -> classifyOrphan() always answers false in strict mode.
                    const metadata = { type: item.type };
                    const verdict = classify({ id, name: id, type: 'firestore', metadata });

                    resources.push({
                        id,
                        name: id,
                        type: 'firestore',
                        region: item.locationId,
                        status: 'READY', // Firestore doesn't provide a simple 'state' in this list
                        isOrphaned: verdict.orphaned,
                        orphanReason: verdict.reason,
                        metadata
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
                // Fetch API keys from Secret Manager or metadata
                const resolvedConfigs = await Promise.all((project.storageConfigs || []).map(async (s) => {
                    let apiKey = s.metadata?.providerApiKey as string;
                    if (!apiKey && s.providerApiKeySecretId) {
                        try {
                            apiKey = await getSecretValue(s.providerApiKeySecretId);
                        } catch (e) {
                            console.error(`[Discovery] Failed to fetch API key from Secret Manager for ${s.id}:`, e);
                        }
                    }
                    return { ...s, apiKey };
                }));

                // Find unique API keys for each provider
                const supabaseKeys = Array.from(new Set(
                    resolvedConfigs
                        .filter(s => s.type === 'supabase' && s.apiKey)
                        .map(s => s.apiKey as string)
                ));

                const neonKeys = Array.from(new Set(
                    resolvedConfigs
                        .filter(s => s.type === 'neon' && s.apiKey)
                        .map(s => s.apiKey as string)
                ));

                const mongodbKeys = Array.from(new Set(
                    resolvedConfigs
                        .filter(s => s.type === 'mongodb-atlas' && s.apiKey)
                        .map(s => ({
                            apiKey: s.apiKey as string,
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
