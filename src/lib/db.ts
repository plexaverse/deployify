import { getDb, Collections } from '@/lib/firebase';
import type { User, Project, Deployment, Team, TeamMembership, TeamWithRole, TeamInvite, TeamRole, DeploymentType } from '@/types';
import { generateId, cleanFirestoreData } from '@/lib/utils';
import { decrypt } from '@/lib/crypto';
import { getSecretValue, upsertSecret } from '@/lib/gcp/secrets';
import { deriveTopology } from '@/lib/gcp/topology';
import { pickSlugOwner, SLUG_COLLISION_SCAN_LIMIT } from '@/lib/slug-registry';
import {
    getMembershipIntegrityMode,
    membershipDocId,
    pickEffectiveMembership,
    TEAM_MEMBERSHIP_SCAN_LIMIT,
    TEAM_MEMBERSHIP_SWEEP_ROUNDS,
} from '@/lib/team-membership';
import { pickRepoBindingOwner, REPO_COLLISION_SCAN_LIMIT } from '@/lib/repo-binding';
import { config } from '@/lib/config';
import type { QueryDocumentSnapshot, DocumentData, DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
// ============= User Operations =============

export async function createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const db = getDb();
    const id = userData.githubId.toString();
    const now = new Date();

    const user: User = {
        ...userData,
        id,
        createdAt: now,
        updatedAt: now,
    };

    await db.collection(Collections.USERS).doc(id).set(cleanFirestoreData(user));
    return user;
}

export async function getUserById(id: string): Promise<User | null> {
    const db = getDb();
    const doc = await db.collection(Collections.USERS).doc(id).get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data();
    return {
        ...data,
        subscription: data?.subscription ? {
            ...data.subscription,
            expiresAt: data.subscription.expiresAt?.toDate ? data.subscription.expiresAt.toDate() : data.subscription.expiresAt
        } : undefined,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
    } as User;
}

export async function deleteUser(id: string): Promise<void> {
    const db = getDb();
    await db.collection(Collections.USERS).doc(id).delete();
}

export async function updateUser(id: string, data: Partial<User>): Promise<void> {
    const db = getDb();
    await db.collection(Collections.USERS).doc(id).update(cleanFirestoreData({
        ...data,
        updatedAt: new Date(),
    }));
}

/**
 * Refresh all project deployments that use a specific storage connector.
 * This forces a new revision in Cloud Run to pick up the latest secret values.
 */
export async function refreshProjectDeployments(
    projectId: string,

    _storageId: string // Reserved for future filtering by storage connector
): Promise<{ refreshed: string[]; failed: string[] }> {
    const project = await getProjectById(projectId);
    if (!project) return { refreshed: [], failed: [] };

    const refreshed: string[] = [];
    const failed: string[] = [];

    // Identify services to refresh
    const services: { name: string; region: string }[] = [];

    // 1. Production service
    if (project.cloudRunServiceId) {
        services.push({
            name: project.cloudRunServiceId,
            region: project.region || 'asia-south1'
        });
    }

    // 2. Recent preview services (last 5)
    const recentPreviews = await listDeploymentsByProject(projectId, 10);
    const uniquePreviews = new Set<string>();

    for (const deploy of recentPreviews) {
        if (deploy.type === 'preview' && deploy.status === 'ready' && deploy.url) {
            const serviceName = deploy.url.split('://')[1]?.split('.')[0];
            if (serviceName && !uniquePreviews.has(serviceName)) {
                uniquePreviews.add(serviceName);
                services.push({
                    name: serviceName,
                    region: project.region || 'asia-south1'
                });
            }
        }
    }

    if (services.length === 0) return { refreshed: [], failed: [] };

    try {
        const { getGcpAccessToken } = await import('@/lib/gcp/auth');
        const { refreshService } = await import('@/lib/gcp/cloudrun');
        const accessToken = await getGcpAccessToken();

        for (const service of services) {
            try {
                await refreshService(service.name, accessToken, service.region);
                refreshed.push(service.name);
            } catch (e) {
                console.error(`[Refresh] Failed to refresh service ${service.name}:`, e);
                failed.push(service.name);
            }
        }
    } catch (e) {
        console.error(`[Refresh] Global refresh failure for project ${projectId}:`, e);
    }

    return { refreshed, failed };
}

export interface ReplicaMetadata {
    id: string;
    name: string;
    region: string;
    status: string;
    connectionString?: string;
    health?: {
        status: string;
        latency: number;
    };
}

/**
 * Select the best replica based on health, weights, and latency.
 * Implements Top-N Randomized selection with weighted fallback.
 */
export function selectReplica(
    replicas: ReplicaMetadata[],
    weights: Record<string, number> = {}
): ReplicaMetadata | null {
    const healthyReplicas = replicas.filter(r =>
        (r.status === 'active' || r.status === 'DONE') &&
        (!r.health || r.health.status !== 'unhealthy')
    );

    if (healthyReplicas.length === 0) return null;

    // 1. Try Weighted Selection
    const weightedHealthy = healthyReplicas.filter(r => (weights[r.id] || 0) > 0);
    if (weightedHealthy.length > 0) {
        const totalWeight = weightedHealthy.reduce((acc, r) => acc + (weights[r.id] || 0), 0);
        let random = Math.random() * totalWeight;
        for (const r of weightedHealthy) {
            random -= (weights[r.id] || 0);
            if (random <= 0) return r;
        }
    }

    // 2. Fallback to Latency-Weighted Probability (Phase 112)
    // We only consider "Top-N" candidates (within 50ms of the best performer)
    const sortedReplicas = [...healthyReplicas].sort((a, b) =>
        (a.health?.latency || 0) - (b.health?.latency || 0)
    );

    const bestLatency = (sortedReplicas[0]?.health?.latency || 0);
    const candidates = sortedReplicas.filter((r, idx) =>
        idx === 0 || (r.health?.latency || 0) <= bestLatency + 50
    );

    if (candidates.length === 1) return candidates[0];

    // Calculate inverse latency weights (lower latency = higher weight)
    // We add a small constant to avoid division by zero and smooth distribution
    const scoringReplicas = candidates.map(r => ({
        replica: r,
        score: 1 / ((r.health?.latency || 1) + 5)
    }));

    const totalScore = scoringReplicas.reduce((acc, s) => acc + s.score, 0);
    let random = Math.random() * totalScore;

    for (const s of scoringReplicas) {
        random -= s.score;
        if (random <= 0) return s.replica;
    }

    return candidates[0];
}

/**
 * Clone a storage configuration to a new environment or project context
 */
export async function cloneStorageConfig(
    projectId: string,
    storageId: string,
    overrides: {
        name?: string;
        environment?: 'production' | 'preview' | 'both';
        envKey?: string;
        includeData?: boolean;
        targetProjectId?: string;
    } = {}
): Promise<import('@/types').StorageConfig | null> {
    const project = await getProjectById(projectId);
    if (!project || !project.storageConfigs) return null;

    const storage = project.storageConfigs.find(s => s.id === storageId);
    if (!storage) return null;

    const newId = `storage_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();

    let connectionStringSecretId = storage.connectionStringSecretId;

    // Duplicating the secret in Secret Manager for isolation
    if (storage.connectionStringSecretId) {
        try {
            const sourceValue = await getSecretValue(storage.connectionStringSecretId);
            if (sourceValue) {
                const newSecretId = `deployify-${projectId}-${newId}-conn`;
                connectionStringSecretId = await upsertSecret(newSecretId, sourceValue);
            }
        } catch (e) {
            console.error(`[Cloning] Failed to duplicate secret for ${storage.name}:`, e);
            // We continue with the existing secret ID if duplication fails,
            // though isolation won't be achieved for the connection string.
        }
    }

    const cloned: import('@/types').StorageConfig = {
        ...storage,
        id: newId,
        name: overrides.name || `${storage.name} (CLONE)`,
        status: overrides.includeData ? 'provisioning' : 'active',
        environment: overrides.environment || storage.environment,
        envKey: overrides.envKey || storage.envKey,
        connectionStringSecretId,
        createdAt: now,
        updatedAt: now,
        metadata: {
            ...storage.metadata,
            operationName: undefined, // Clear operation tracking for clone
            lastOperation: undefined,
            clonedFrom: storageId,
            includeData: overrides.includeData
        }
    };

    if (overrides.targetProjectId && overrides.targetProjectId !== projectId) {
        const targetProject = await getProjectById(overrides.targetProjectId);
        if (targetProject) {
            const updatedConfigs = [...(targetProject.storageConfigs || []), cloned];
            await updateProject(overrides.targetProjectId, { storageConfigs: updatedConfigs });
        }
    } else {
        const updatedConfigs = [...project.storageConfigs, cloned];
        await updateProject(projectId, { storageConfigs: updatedConfigs });
    }

    return cloned;
}

/**
 * Get environment variables for a deployment, handled filtering by environment/target and decryption
 */
export async function getEnvVarsForDeployment(
    project: Project,
    envTarget: 'production' | 'preview',
    context?: { branch?: string; pullRequestNumber?: number }
): Promise<{
    buildEnvVars: Record<string, string>;
    runtimeEnvVars: Record<string, string>;
    runtimeSecrets?: Record<string, string>;
    cloudSqlInstances?: string[];
    needsVpc?: boolean;
    vpcNetwork?: string;
    vpcSubnet?: string;
}> {
    const envVars = project.envVariables || [];
    const buildEnvVars: Record<string, string> = {};
    const runtimeEnvVars: Record<string, string> = {};
    const runtimeSecrets: Record<string, string> = {};
    const cloudSqlInstances: string[] = [];
    let needsVpc = false;
    let vpcNetwork: string | undefined;
    let vpcSubnet: string | undefined;

    // 1. Process regular environment variables
    for (const env of envVars) {
        // Filter by environment (Production vs Preview)
        if (env.environment && env.environment !== 'both' && env.environment !== envTarget) {
            continue;
        }

        let value = env.value;
        if (env.isSecret && env.isEncrypted) {
            try {
                value = decrypt(env.value);
            } catch (e) {
                console.error(`Failed to decrypt secret ${env.key}:`, e);
                // We throw here to fail the deployment safely rather than deploying with invalid secrets
                throw new Error(`Failed to decrypt secret ${env.key}. Please update the variable value.`);
            }
        }

        if (env.target === 'build' || env.target === 'both') {
            buildEnvVars[env.key] = value;
        }
        if (env.target === 'runtime' || env.target === 'both') {
            runtimeEnvVars[env.key] = value;
        }
    }

    // 2. Process Storage configurations (Connectors)
    let storageConfigs = project.storageConfigs || [];

    // Phase 134: Discovery Shared Connectors from other projects in the same team
    if (project.teamId) {
        const teamProjects = await listProjectsByTeam(project.teamId);
        for (const tp of teamProjects) {
            if (tp.id === project.id) continue;
            const shared = (tp.storageConfigs || []).filter(s => s.sharedWithProjects?.includes(project.id));
            if (shared.length > 0) {
                // Annotate as shared and from which project
                const sharedAnnotated = shared.map(s => ({
                    ...s,
                    name: `${s.name} (SHARED: ${tp.name.toUpperCase()})`,
                    metadata: { ...s.metadata, sharedFromProject: tp.id }
                }));
                storageConfigs = [...storageConfigs, ...sharedAnnotated];
            }
        }
    }

    for (const storage of storageConfigs) {
        // Phase 120: Calculate Connectivity Topology
        const topology = deriveTopology(storage);

        // Filter by environment
        if (storage.environment && storage.environment !== 'both' && storage.environment !== envTarget) {
            continue;
        }

        // Handle Secret Only mode
        if (storage.metadata?.secretOnly) {
            continue;
        }

        // Update topology for current context
        storage.topology = topology;

        if (storage.connectionStringSecretId) {
            // Determine variable name based on custom key or type defaults
            let envKey = storage.envKey;

            if (!envKey) {
                if (storage.type === 'memorystore-redis') envKey = 'REDIS_URL';
                else if (storage.type === 'mongodb-atlas') envKey = 'MONGODB_URI';
                else envKey = 'DATABASE_URL';
            }

            // Handle Read Replicas (Intelligent Traffic Steering)
            const replicas = (storage.metadata?.replicas as ReplicaMetadata[]) || [];
            const selectedReplica = selectReplica(replicas, storage.readWeights);

            if (selectedReplica) {

                let replicaConn = selectedReplica.connectionString;

                // For Cloud SQL replicas, derive IAM connection string if no specific string is provided
                if (!replicaConn && storage.type.includes('cloud-sql')) {
                    const { getReplicaConnectionString } = await import('@/lib/gcp/cloudsql');
                    const dbType = storage.type.includes('postgres') ? 'postgres' : 'mysql';
                    replicaConn = getReplicaConnectionString(selectedReplica.name, selectedReplica.region, dbType);
                }

                if (replicaConn) {
                    const readOnlyKey = `${envKey}_READONLY`;
                    runtimeEnvVars[readOnlyKey] = replicaConn;
                    if (storage.environment === 'both' || storage.environment === envTarget) {
                        buildEnvVars[readOnlyKey] = replicaConn;
                    }
                }
            }

            // Handle Ephemeral Branching
            let branchedValue: string | undefined;
            if (envTarget === 'preview' && storage.branchingSettings?.enabled) {
                try {
                    const baseConnectionString = await getSecretValue(storage.connectionStringSecretId);
                    if (baseConnectionString) {
                        branchedValue = getBranchConnectionString(
                            baseConnectionString,
                            storage.type,
                            storage.branchingSettings,
                            context
                        );
                    }
                } catch (e) {
                    console.warn(`[Branching] Failed to derive branched connection string for ${storage.name}:`, e);
                }
            }

            if (branchedValue) {
                // For branched environments, we still use Secret Manager for runtime but with a temporary secret
                // or fall back to env var if it's highly dynamic. For now, we use env var for PR branches.
                runtimeEnvVars[envKey] = branchedValue;
                if (storage.environment === 'both' || storage.environment === 'preview') {
                    buildEnvVars[envKey] = branchedValue;
                }
            } else {
                // Prefer native Secret Manager mounting for runtime
                let secretId = storage.connectionStringSecretId;

                // Construct full resource name if providerProjectId is specified and it's not already a full path
                if (storage.providerProjectId && !secretId.startsWith('projects/')) {
                    secretId = `projects/${storage.providerProjectId}/secrets/${secretId}`;
                } else if (!secretId.startsWith('projects/')) {
                    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
                    secretId = `projects/${gcpProjectId}/secrets/${secretId}`;
                }

                runtimeSecrets[envKey] = secretId;

                // For build-time tools (like Prisma), we still need the actual value
                if (storage.environment === 'both' || storage.environment === envTarget) {
                    try {
                        let connectionString = await getSecretValue(storage.connectionStringSecretId);
                        if (!connectionString) {
                            throw new Error(`Secret value is empty for ${storage.name}`);
                        }

                        // Enforce SSL if configured
                        if (storage.ssl && (storage.type.includes('sql') || storage.type === 'alloydb' || storage.type === 'supabase' || storage.type === 'planetscale' || storage.type === 'mongodb-atlas' || storage.type === 'memorystore-redis')) {
                            try {
                                if (storage.type === 'memorystore-redis') {
                                    // Switch to rediss:// protocol
                                    connectionString = connectionString.replace(/^redis:\/\//, 'rediss://');
                                } else {
                                    const url = new URL(connectionString);
                                    if (storage.type.includes('postgres') || storage.type === 'supabase') {
                                        url.searchParams.set('sslmode', 'require');
                                    } else if (storage.type.includes('mysql') || storage.type === 'planetscale') {
                                        // MySQL often uses a JSON-like ssl param or just a flag
                                        if (!url.searchParams.has('ssl')) {
                                            url.searchParams.set('ssl', '{"rejectUnauthorized":true}');
                                        }
                                    } else if (storage.type === 'mongodb-atlas') {
                                        url.searchParams.set('tls', 'true');
                                    }
                                    connectionString = url.toString();
                                }
                            } catch {
                                // Fallback if not a valid URL
                            }
                        }

                        buildEnvVars[envKey] = connectionString;
                    } catch (e) {
                        console.error(`Failed to fetch storage secret for ${storage.name}:`, e);
                        throw new Error(`Failed to inject build-time storage credential for ${storage.name}. Please verify the connector status.`);
                    }
                }
            }
        }

        // 2b. Explicit Orchestration detection from metadata (GCP Native)
        if (storage.type === 'memorystore-redis') {
            needsVpc = true;
            if (storage.metadata?.vpcNetwork) vpcNetwork = storage.metadata.vpcNetwork as string;
            if (storage.metadata?.vpcSubnet) vpcSubnet = storage.metadata.vpcSubnet as string;
        }

        if (storage.type.includes('cloud-sql') && storage.metadata?.resourceName) {
            const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID || '';
            const region = (storage.metadata?.region as string) || project.region || 'us-central1';
            const instanceName = storage.metadata.resourceName as string;
            cloudSqlInstances.push(`${gcpProjectId}:${region}:${instanceName}`);
        }
    }

    // 3. Final Orchestration Check (Detect requirements from resulting env vars/secrets)
    const allEnvValues = [
        ...Object.values(runtimeEnvVars),
        ...Object.values(buildEnvVars)
    ];

    allEnvValues.forEach(value => {
        const match = value.match(/\/cloudsql\/([a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+)/i);
        if (match && match[1]) {
            cloudSqlInstances.push(match[1]);
        }
        if (value.includes('.redis.cache.google.com') || value.startsWith('redis://')) {
            needsVpc = true;
        }
    });

    return {
        buildEnvVars,
        runtimeEnvVars,
        runtimeSecrets,
        cloudSqlInstances: Array.from(new Set(cloudSqlInstances)),
        needsVpc,
        vpcNetwork,
        vpcSubnet
    };
}

/**
 * Derive a branch-specific connection string for ephemeral environments
 */
/**
 * Get automated migration tasks for a deployment
 */
export async function getMigrationsForDeployment(
    project: Project,
    envTarget: 'production' | 'preview',
    context?: { branch?: string; pullRequestNumber?: number }
): Promise<{ command: string; connectionString: string; envKey: string }[]> {
    const storageConfigs = project.storageConfigs || [];
    const migrations: { command: string; connectionString: string; envKey: string }[] = [];

    for (const storage of storageConfigs) {
        if (!storage.autoMigration || !storage.migrationCommand) {
            continue;
        }

        // Filter by environment
        if (storage.environment && storage.environment !== 'both' && storage.environment !== envTarget) {
            continue;
        }

        if (storage.connectionStringSecretId) {
            let connectionString = await getSecretValue(storage.connectionStringSecretId);

            if (!connectionString) {
                console.warn(`[Migrations] Skipping auto-migration for ${storage.name}: Connection string secret not found.`);
                continue;
            }

            // Handle Ephemeral Branching
            if (envTarget === 'preview' && storage.branchingSettings?.enabled) {
                connectionString = getBranchConnectionString(
                    connectionString,
                    storage.type,
                    storage.branchingSettings,
                    context
                );
            }

            let envKey = storage.envKey;
            if (!envKey) {
                envKey = 'DATABASE_URL';
                if (storage.type === 'memorystore-redis') envKey = 'REDIS_URL';
                if (storage.type === 'mongodb-atlas') envKey = 'MONGODB_URI';
            }

            migrations.push({
                command: storage.migrationCommand,
                connectionString,
                envKey
            });
        }
    }

    return migrations;
}

export function getBranchConnectionString(
    baseConn: string,
    type: string,
    settings: import('@/types').StorageBranchingSettings,
    context?: { branch?: string; pullRequestNumber?: number }
): string {
    if (!context || (!context.branch && !context.pullRequestNumber)) return baseConn;

    const identifier = context.pullRequestNumber
        ? `pr${context.pullRequestNumber}`
        : context.branch?.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() || 'preview';

    // 1. SQL-like connection strings (Postgres, MySQL, Supabase)
    if (type.includes('sql') || type === 'supabase') {
        try {
            const url = new URL(baseConn);
            const baseDbName = url.pathname.split('/')[1] || 'postgres';
            const template = settings.template || '{base}_{identifier}';
            const newDbName = template
                .replace('{base}', baseDbName)
                .replace('{identifier}', identifier);

            url.pathname = `/${newDbName}`;
            return url.toString();
        } catch {
            return baseConn;
        }
    }

    // 1b. PlanetScale (Host-based branching fallback)
    if (type === 'planetscale') {
        try {
            const url = new URL(baseConn);
            // Native branches often use a different hostname or prefix
            url.hostname = `${identifier}.${url.hostname}`;
            return url.toString();
        } catch {
            return baseConn;
        }
    }

    // 2. MongoDB
    if (type === 'mongodb-atlas') {
        try {
            const url = new URL(baseConn);
            const baseDbName = url.pathname.split('/')[1] || 'test';
            const template = settings.template || '{base}_{identifier}';
            const newDbName = template
                .replace('{base}', baseDbName)
                .replace('{identifier}', identifier);

            url.pathname = `/${newDbName}`;
            return url.toString();
        } catch {
            return baseConn;
        }
    }

    // 3. Firestore
    if (type === 'firestore') {
        // baseConn format: firestore://databaseId
        const baseDbName = baseConn.replace('firestore://', '') || '(default)';
        const template = settings.template || 'db-{identifier}';
        const newDbName = template
            .replace('{base}', baseDbName === '(default)' ? 'default' : baseDbName)
            .replace('{identifier}', identifier)
            .replace(/[^a-z0-9-]/g, '-')
            .toLowerCase();

        // Ensure it starts with a letter for Firestore validation
        const finalId = /^[a-z]/.test(newDbName) ? newDbName : `db-${newDbName}`;
        return `firestore://${finalId.replace(/^-+/, '')}`.substring(0, 75); // 75 = 12 (firestore://) + 63
    }

    // 4. Redis / Memorystore (Branching via DB index 0-15)
    if (type === 'memorystore-redis') {
        try {
            const url = new URL(baseConn);
            let dbIndex = 0;

            if (context?.pullRequestNumber) {
                // Use PR number to pick a DB (1-15), leaving 0 for main
                dbIndex = (context.pullRequestNumber % 15) + 1;
            } else if (context?.branch) {
                // Simple hash of branch name to pick a DB (1-15)
                const hash = context.branch.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                dbIndex = (hash % 15) + 1;
            }

            url.pathname = `/${dbIndex}`;
            return url.toString();
        } catch {
            return baseConn;
        }
    }

    return baseConn;
}

// ============= Invite Operations =============

export async function createInvite(
    teamId: string,
    email: string,
    role: TeamRole,
    inviterId: string,
    token: string
): Promise<TeamInvite> {
    const db = getDb();
    const id = generateId('invite');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite: TeamInvite = {
        id,
        teamId,
        email,
        role,
        token,
        inviterId,
        expiresAt,
        createdAt: now,
    };

    await db.collection(Collections.INVITES).doc(id).set(cleanFirestoreData(invite));
    return invite;
}

export async function getInviteByToken(token: string): Promise<TeamInvite | null> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.INVITES)
        .where('token', '==', token)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
        ...data,
        createdAt: data?.createdAt?.toDate(),
        expiresAt: data?.expiresAt?.toDate(),
    } as TeamInvite;
}

export async function getInviteById(id: string): Promise<TeamInvite | null> {
    const db = getDb();
    const doc = await db.collection(Collections.INVITES).doc(id).get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data();
    return {
        ...data,
        createdAt: data?.createdAt?.toDate(),
        expiresAt: data?.expiresAt?.toDate(),
    } as TeamInvite;
}

export async function listInvitesForTeam(teamId: string): Promise<TeamInvite[]> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.INVITES)
        .where('teamId', '==', teamId)
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            createdAt: data?.createdAt?.toDate(),
            expiresAt: data?.expiresAt?.toDate(),
        } as TeamInvite;
    });
}

export async function getProjectBySlugGlobal(slug: string): Promise<Project | null> {
    const db = getDb();
    // Scan a few matches instead of 1 so a slug collision can be detected and resolved
    // deterministically. Uses the same single-field `slug` index as before - no new
    // composite index, so this cannot fail with FAILED_PRECONDITION at deploy time.
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('slug', '==', slug)
        .limit(SLUG_COLLISION_SCAN_LIMIT)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = pickSlugOwner(snapshot.docs, slug);
    const data = doc.data();
    return {
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
    } as Project;
}

export async function getProjectByApiKey(apiKey: string): Promise<Project | null> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('analyticsApiKey', '==', apiKey)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
    } as Project;
}

export async function deleteInvite(id: string): Promise<void> {
    const db = getDb();
    await db.collection(Collections.INVITES).doc(id).delete();
}

export async function acceptInvite(inviteId: string, userId: string): Promise<void> {
    const db = getDb();
    const inviteRef = db.collection(Collections.INVITES).doc(inviteId);

    if (getMembershipIntegrityMode() !== 'strict') {
        // ---- Legacy path: byte-for-byte the pre-fix code. Kill switch / MOCK_DB. ----
        // Get invite details for membership creation
        const inviteDoc = await inviteRef.get();
        if (!inviteDoc.exists) {
            throw new Error('Invite not found');
        }
        const invite = inviteDoc.data() as TeamInvite;

        const membershipId = generateId('tm');
        const now = new Date();

        const membership: TeamMembership = {
            id: membershipId,
            teamId: invite.teamId,
            userId,
            role: invite.role,
            joinedAt: now,
        };

        const batch = db.batch();

        // Create membership
        batch.set(db.collection(Collections.TEAM_MEMBERSHIPS).doc(membershipId), membership);

        // Delete invite
        batch.delete(inviteRef);

        await batch.commit();
        return;
    }

    // Redeeming an invite is idempotent per (teamId, userId): a member who redeems a
    // second invite must NOT end up with a second membership document, because
    // revocation only ever resolves one of them. Transactional so two invites redeemed
    // concurrently cannot both pass the "no membership yet" check, and the new document
    // uses a deterministic id so even a lost race writes the same path.
    await db.runTransaction(async (tx) => {
        // All reads first - Firestore forbids a read after a write in a transaction.
        const inviteDoc = await tx.get(inviteRef);
        if (!inviteDoc.exists) {
            throw new Error('Invite not found');
        }
        const invite = inviteDoc.data() as TeamInvite;

        const existing = await tx.get(
            db.collection(Collections.TEAM_MEMBERSHIPS)
                .where('teamId', '==', invite.teamId)
                .where('userId', '==', userId)
                .limit(TEAM_MEMBERSHIP_SCAN_LIMIT)
        );

        if (!existing.empty) {
            // Already a member (dual-read: legacy random-id documents match too).
            // Consume the invite, collapse any duplicates this account already carries,
            // and leave the role alone - promotion goes through
            // PATCH /api/teams/[id]/members/[userId], which enforces who may grant what.
            const keep = pickEffectiveMembership(existing.docs, invite.teamId, userId);
            for (const doc of existing.docs) {
                if (doc.id !== keep.id) tx.delete(doc.ref);
            }
            tx.delete(inviteRef);
            return;
        }

        const membershipId = membershipDocId(invite.teamId, userId);
        const membership: TeamMembership = {
            id: membershipId,
            teamId: invite.teamId,
            userId,
            role: invite.role,
            joinedAt: new Date(),
        };

        tx.set(db.collection(Collections.TEAM_MEMBERSHIPS).doc(membershipId), membership);
        tx.delete(inviteRef);
    });
}

export async function getTeamMembership(teamId: string, userId: string): Promise<TeamMembership | null> {
    const db = getDb();
    // Scan a few matches instead of 1 so duplicate memberships resolve deterministically
    // instead of by whatever Firestore returns first. Same equality-pair query and same
    // automatic index as before - a clean member still costs exactly one document read.
    const strict = getMembershipIntegrityMode() === 'strict';
    const snapshot = await db
        .collection(Collections.TEAM_MEMBERSHIPS)
        .where('teamId', '==', teamId)
        .where('userId', '==', userId)
        .limit(strict ? TEAM_MEMBERSHIP_SCAN_LIMIT : 1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = pickEffectiveMembership(snapshot.docs, teamId, userId);
    const data = doc.data();
    return {
        ...data,
        joinedAt: data?.joinedAt?.toDate(),
    } as TeamMembership;
}


export async function upsertUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const existingUser = await getUserById(userData.githubId.toString());

    if (existingUser) {
        await updateUser(existingUser.id, userData);
        return { ...existingUser, ...userData, updatedAt: new Date() };
    }

    return createUser(userData);
}

// ============= Team Operations =============

export async function createTeam(
    teamData: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>,
    ownerId: string
): Promise<Team> {
    const db = getDb();
    const id = generateId('team');
    const now = new Date();

    const team: Team = {
        ...teamData,
        id,
        createdAt: now,
        updatedAt: now,
    };

    const batch = db.batch();

    // Create team
    batch.set(db.collection(Collections.TEAMS).doc(id), cleanFirestoreData(team));

    // Create owner membership
    const membershipId = generateId('tm');
    const membership: TeamMembership = {
        id: membershipId,
        teamId: id,
        userId: ownerId,
        role: 'owner',
        joinedAt: now,
    };

    batch.set(db.collection(Collections.TEAM_MEMBERSHIPS).doc(membershipId), membership);

    await batch.commit();

    return team;
}

export async function deleteTeam(teamId: string): Promise<void> {
    const db = getDb();

    // 1. Delete all projects (handled separately as they have their own cleanup logic)
    const projects = await listProjectsByTeam(teamId);
    for (const project of projects) {
        await deleteProject(project.id);
    }

    const batch = db.batch();

    // 2. Delete memberships
    const membershipsSnapshot = await db.collection(Collections.TEAM_MEMBERSHIPS).where('teamId', '==', teamId).get();
    membershipsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    // 3. Delete invites
    const invitesSnapshot = await db.collection(Collections.INVITES).where('teamId', '==', teamId).get();
    invitesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    // 4. Delete team
    batch.delete(db.collection(Collections.TEAMS).doc(teamId));

    await batch.commit();
}

export async function getTeamById(id: string): Promise<Team | null> {
    const db = getDb();
    const doc = await db.collection(Collections.TEAMS).doc(id).get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data();
    return {
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
        subscription: data?.subscription ? {
            ...data.subscription,
            expiresAt: data.subscription.expiresAt?.toDate ? data.subscription.expiresAt.toDate() : data.subscription.expiresAt
        } : undefined,
    } as Team;
}

export async function listTeamMembers(teamId: string): Promise<TeamMembership[]> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.TEAM_MEMBERSHIPS)
        .where('teamId', '==', teamId)
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            joinedAt: data?.joinedAt?.toDate(),
        } as TeamMembership;
    });
}

export async function deleteTeamMembership(id: string): Promise<void> {
    const db = getDb();
    await db.collection(Collections.TEAM_MEMBERSHIPS).doc(id).delete();
}

/**
 * Revoke a member's access to a team: delete EVERY membership document for the pair, not
 * just the one `getTeamMembership` happened to resolve. `knownMembershipId` is the id the
 * caller already resolved; in legacy mode it is the only document touched, exactly as
 * today. Returns how many documents were deleted.
 */
export async function deleteTeamMembershipsForUser(
    teamId: string,
    userId: string,
    knownMembershipId: string
): Promise<number> {
    if (getMembershipIntegrityMode() !== 'strict') {
        await deleteTeamMembership(knownMembershipId);
        return 1;
    }

    const db = getDb();
    const swept = new Set<string>();

    for (let round = 0; round < TEAM_MEMBERSHIP_SWEEP_ROUNDS; round++) {
        const snapshot = await db
            .collection(Collections.TEAM_MEMBERSHIPS)
            .where('teamId', '==', teamId)
            .where('userId', '==', userId)
            .limit(TEAM_MEMBERSHIP_SCAN_LIMIT)
            .get();

        if (snapshot.empty) break;

        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            swept.add(doc.id);
        });
        await batch.commit();

        if (snapshot.docs.length < TEAM_MEMBERSHIP_SCAN_LIMIT) break;
    }

    // Parity with the pre-fix delete-by-id: a document whose stored `id` field disagrees
    // with its document id, or which lacks teamId/userId, is not matched by the query
    // above. Deleting a missing document is a no-op in Firestore.
    if (knownMembershipId && !swept.has(knownMembershipId)) {
        await deleteTeamMembership(knownMembershipId);
        swept.add(knownMembershipId);
    }

    if (swept.size > 1) {
        console.error(
            `[TeamMembership] Revoked ${swept.size} membership documents for ` +
            `team=${teamId} user=${userId}: ${[...swept].join(',')}`
        );
    }

    return swept.size;
}

export async function updateTeamMembership(id: string, data: Partial<TeamMembership>): Promise<void> {
    const db = getDb();
    await db.collection(Collections.TEAM_MEMBERSHIPS).doc(id).update(cleanFirestoreData(data));
}

/**
 * Apply a membership change (today: only `role`) to EVERY membership document for the
 * pair, so a duplicate cannot retain the pre-demotion role. Legacy mode updates only
 * `knownMembershipId`, exactly as today.
 */
export async function updateTeamMembershipsForUser(
    teamId: string,
    userId: string,
    data: Partial<TeamMembership>,
    knownMembershipId: string
): Promise<number> {
    if (getMembershipIntegrityMode() !== 'strict') {
        await updateTeamMembership(knownMembershipId, data);
        return 1;
    }

    const db = getDb();
    const snapshot = await db
        .collection(Collections.TEAM_MEMBERSHIPS)
        .where('teamId', '==', teamId)
        .where('userId', '==', userId)
        .limit(TEAM_MEMBERSHIP_SCAN_LIMIT)
        .get();

    if (snapshot.empty) {
        // Same failure the pre-fix code produced when the document went away mid-request.
        await updateTeamMembership(knownMembershipId, data);
        return 1;
    }

    const payload = cleanFirestoreData(data);
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.update(doc.ref, payload));
    await batch.commit();

    if (snapshot.docs.length > 1) {
        console.error(
            `[TeamMembership] Updated ${snapshot.docs.length} membership documents for ` +
            `team=${teamId} user=${userId}`
        );
    }

    return snapshot.docs.length;
}

export async function listTeamsForUser(userId: string): Promise<Team[]> {
    const db = getDb();
    const membershipsSnapshot = await db
        .collection(Collections.TEAM_MEMBERSHIPS)
        .where('userId', '==', userId)
        .get();

    const teamIds = membershipsSnapshot.docs.map(doc => doc.data().teamId);

    if (teamIds.length === 0) {
        return [];
    }

    const teamRefs = teamIds.map(id => db.collection(Collections.TEAMS).doc(id));
    const teamsSnapshot = await db.getAll(...teamRefs);

    return teamsSnapshot
        .filter(doc => doc.exists)
        .map(doc => {
            const data = doc.data();
            return {
                ...data,
                createdAt: data?.createdAt?.toDate(),
                updatedAt: data?.updatedAt?.toDate(),
                subscription: data?.subscription ? {
                    ...data.subscription,
                    expiresAt: data.subscription.expiresAt?.toDate ? data.subscription.expiresAt.toDate() : data.subscription.expiresAt
                } : undefined,
            } as Team;
        });
}

// Allow injecting db for testing
export async function listTeamsWithMembership(userId: string, dbClient?: Firestore): Promise<TeamWithRole[]> {
    const db = dbClient || getDb();
    const membershipsSnapshot = await db
        .collection(Collections.TEAM_MEMBERSHIPS)
        .where('userId', '==', userId)
        .get();

    if (membershipsSnapshot.empty) {
        return [];
    }

    const memberships: TeamMembership[] = membershipsSnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => {
        const data = doc.data();
        return {
            ...data,
            joinedAt: data?.joinedAt?.toDate(),
        } as TeamMembership;
    });

    const teamIds = memberships.map((m: TeamMembership) => m.teamId);
    const teamRefs = teamIds.map((id: string) => db.collection(Collections.TEAMS).doc(id));
    const teamsSnapshot = await db.getAll(...teamRefs);

    return teamsSnapshot
        .map((doc: DocumentSnapshot<DocumentData>, index: number) => {
            if (!doc.exists) return null;
            const data = doc.data();
            const team = {
                ...data,
                createdAt: data?.createdAt?.toDate(),
                updatedAt: data?.updatedAt?.toDate(),
                subscription: data?.subscription ? {
                    ...data.subscription,
                    expiresAt: data.subscription.expiresAt?.toDate ? data.subscription.expiresAt.toDate() : data.subscription.expiresAt
                } : undefined,
            } as Team;

            return {
                ...team,
                membership: memberships[index]
            } as TeamWithRole;
        })
        .filter((t: TeamWithRole | null): t is TeamWithRole => t !== null);
}

// ============= Project Operations =============

export async function createProject(
    projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'cloudRunServiceId' | 'productionUrl'> & { region?: string | null }
): Promise<Project> {
    const db = getDb();
    const id = generateId('proj');
    const now = new Date();

    const project: Project = {
        ...projectData,
        id,
        teamId: projectData.teamId ?? null,
        customDomain: projectData.customDomain ?? null,
        cloudRunServiceId: null,
        productionUrl: null,
        region: projectData.region ?? null, // Use provided region or default to null
        createdAt: now,
        updatedAt: now,
    };

    await db.collection(Collections.PROJECTS).doc(id).set(cleanFirestoreData(project));
    return project;
}

export async function getProjectById(id: string): Promise<Project | null> {
    const db = getDb();
    const doc = await db.collection(Collections.PROJECTS).doc(id).get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data();
    return {
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
    } as Project;
}

export async function getProjectBySlug(userId: string, slug: string): Promise<Project | null> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('userId', '==', userId)
        .where('slug', '==', slug)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
    } as Project;
}

/**
 * Every project id claiming this slug, across ALL users.
 *
 * getProjectBySlug() only enforces uniqueness within one userId, so `dfy-<slug>` in the
 * shared GCP project can be claimed by more than one tenant. Callers that are about to
 * destroy a GCP resource named after a slug use this to detect that contention.
 * Ids only - no document bodies leave the tenant boundary.
 */
export async function listProjectIdsBySlug(slug: string): Promise<string[]> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('slug', '==', slug)
        .get();

    return snapshot.docs.map(doc => (doc.data()?.id as string) || doc.id);
}

/**
 * Resolve an inbound GitHub webhook delivery to the project that owns the repo.
 *
 * `repoFullName` is NOT unique - nothing has ever enforced that - and the webhook HMAC
 * secret is global, so a squatter project bound to someone else's repo used to be able
 * to win the old `limit(1)`. We now scan a bounded window and let pickRepoBindingOwner()
 * break the tie; with no collision, or no admin-verification evidence, it returns
 * docs[0], which is exactly the document limit(1) returned before.
 *
 * Uses the same single-field `repoFullName` index as before - no composite index, so
 * this cannot fail with FAILED_PRECONDITION at deploy time.
 */
export async function getProjectByRepoFullName(repoFullName: string): Promise<Project | null> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('repoFullName', '==', repoFullName)
        .limit(REPO_COLLISION_SCAN_LIMIT)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = pickRepoBindingOwner(snapshot.docs, repoFullName);
    const data = doc.data();
    return {
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
    } as Project;
}

export async function listProjectsByUser(userId: string): Promise<Project[]> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('userId', '==', userId)
        .orderBy('updatedAt', 'desc')
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            createdAt: data?.createdAt?.toDate(),
            updatedAt: data?.updatedAt?.toDate(),
        } as Project;
    });
}

export async function listProjectsByTeam(teamId: string): Promise<Project[]> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('teamId', '==', teamId)
        .orderBy('updatedAt', 'desc')
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            createdAt: data?.createdAt?.toDate(),
            updatedAt: data?.updatedAt?.toDate(),
        } as Project;
    });
}

export async function listPersonalProjects(userId: string): Promise<Project[]> {
    const db = getDb();
    // Fetch all projects created by user
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('userId', '==', userId)
        .orderBy('updatedAt', 'desc')
        .get();

    return snapshot.docs
        .map(doc => {
            const data = doc.data();
            return {
                ...data,
                createdAt: data?.createdAt?.toDate(),
                updatedAt: data?.updatedAt?.toDate(),
            } as Project;
        })
        .filter(project => !project.teamId); // Filter out team projects
}

export async function updateProject(id: string, data: Partial<Project>): Promise<void> {
    const db = getDb();
    await db.collection(Collections.PROJECTS).doc(id).update(cleanFirestoreData({
        ...data,
        updatedAt: new Date(),
    }));
}

export async function deleteProject(id: string): Promise<void> {
    const db = getDb();

    // Delete all deployments for this project
    const deploymentsSnapshot = await db
        .collection(Collections.DEPLOYMENTS)
        .where('projectId', '==', id)
        .get();

    const batch = db.batch();
    deploymentsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    // Delete project
    batch.delete(db.collection(Collections.PROJECTS).doc(id));

    await batch.commit();
}

// ============= Deployment Operations =============

export async function createDeployment(
    deploymentData: Omit<Deployment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Deployment> {
    const db = getDb();
    const id = generateId('deploy');
    const now = new Date();

    const deployment: Deployment = {
        ...deploymentData,
        id,
        createdAt: now,
        updatedAt: now,
    };

    await db.collection(Collections.DEPLOYMENTS).doc(id).set(cleanFirestoreData(deployment));
    return deployment;
}

export async function getDeploymentById(id: string): Promise<Deployment | null> {
    const db = getDb();
    const doc = await db.collection(Collections.DEPLOYMENTS).doc(id).get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data();
    return {
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
        readyAt: data?.readyAt?.toDate(),
    } as Deployment;
}

export async function removeAliasFromOtherDeployments(
    projectId: string,
    alias: string,
    excludeDeploymentId: string
): Promise<void> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.DEPLOYMENTS)
        .where('projectId', '==', projectId)
        .where('aliases', 'array-contains', alias)
        .get();

    const batch = db.batch();
    let count = 0;

    snapshot.docs.forEach(doc => {
        if (doc.id !== excludeDeploymentId) {
            const data = doc.data();
            const newAliases = (data.aliases || []).filter((a: string) => a !== alias);
            batch.update(doc.ref, { aliases: newAliases, updatedAt: new Date() });
            count++;
        }
    });

    if (count > 0) {
        await batch.commit();
    }
}

export async function listDeploymentsByProject(
    projectId: string,
    limit: number = 20
): Promise<Deployment[]> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.DEPLOYMENTS)
        .where('projectId', '==', projectId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            createdAt: data?.createdAt?.toDate(),
            updatedAt: data?.updatedAt?.toDate(),
            readyAt: data?.readyAt?.toDate(),
        } as Deployment;
    });
}

export async function getLatestDeployment(
    projectId: string,
    type?: DeploymentType
): Promise<Deployment | null> {
    const db = getDb();
    let query = db
        .collection(Collections.DEPLOYMENTS)
        .where('projectId', '==', projectId);

    if (type) {
        query = query.where('type', '==', type);
    }

    const snapshot = await query
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
        ...data,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
        readyAt: data?.readyAt?.toDate(),
    } as Deployment;
}

export async function updateDeployment(id: string, data: Partial<Deployment>): Promise<void> {
    const db = getDb();
    await db.collection(Collections.DEPLOYMENTS).doc(id).update(cleanFirestoreData({
        ...data,
        updatedAt: new Date(),
    }));
}
