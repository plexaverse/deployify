import { getDb, Collections } from '@/lib/firebase';
import type { User, Project, Deployment, Team, TeamMembership, TeamWithRole, TeamInvite, TeamRole, DeploymentType } from '@/types';
import { generateId, cleanFirestoreData } from '@/lib/utils';
import { decrypt } from '@/lib/crypto';
import { getSecretValue } from '@/lib/gcp/secrets';
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
    autoMigrations?: {
        envKey: string;
        secretId: string;
        command: string;
        storageType: string;
        branchingSettings?: import('@/types').StorageBranchingSettings;
    }[];
}> {
    const envVars = project.envVariables || [];
    const buildEnvVars: Record<string, string> = {};
    const runtimeEnvVars: Record<string, string> = {};
    const runtimeSecrets: Record<string, string> = {};
    const cloudSqlInstances: string[] = [];
    const autoMigrations: {
        envKey: string;
        secretId: string;
        command: string;
        storageType: string;
        branchingSettings?: import('@/types').StorageBranchingSettings;
    }[] = [];
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
    const storageConfigs = project.storageConfigs || [];
    for (const storage of storageConfigs) {
        // Filter by environment
        if (storage.environment && storage.environment !== 'both' && storage.environment !== envTarget) {
            continue;
        }

        // Handle Secret Only mode
        if (storage.metadata?.secretOnly) {
            continue;
        }

        if (storage.connectionStringSecretId) {
            // Determine variable name based on custom key or type defaults
            let envKey = storage.envKey;

            if (!envKey) {
                envKey = 'DATABASE_URL';
                if (storage.type === 'memorystore-redis') envKey = 'REDIS_URL';
                if (storage.type === 'mongodb-atlas') envKey = 'MONGODB_URI';
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
                // If branched, we must inject the value directly as it's dynamic per deployment
                runtimeEnvVars[envKey] = branchedValue;
                if (storage.environment === 'both' || storage.environment === 'preview') {
                    buildEnvVars[envKey] = branchedValue;
                }
            } else {
                // Prefer native Secret Manager mounting for runtime
                runtimeSecrets[envKey] = storage.connectionStringSecretId;

                // For build-time tools (like Prisma), we still need the actual value
                if (storage.environment === 'both' || storage.environment === envTarget) {
                    try {
                        const connectionString = await getSecretValue(storage.connectionStringSecretId);
                        if (!connectionString) {
                            throw new Error(`Secret value is empty for ${storage.name}`);
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

        // 2c. Automated Migration detection
        if (storage.autoMigration && storage.migrationCommand && storage.connectionStringSecretId) {
            autoMigrations.push({
                envKey: storage.envKey || 'DATABASE_URL',
                secretId: storage.connectionStringSecretId,
                command: storage.migrationCommand,
                storageType: storage.type,
                branchingSettings: storage.branchingSettings?.enabled ? storage.branchingSettings : undefined
            });
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
        vpcSubnet,
        autoMigrations
    };
}

/**
 * Identify storage connectors that require automated migrations for a deployment
 */
export async function getMigrationsForDeployment(
    project: Project,
    envTarget: 'production' | 'preview',
    context?: { branch?: string; pullRequestNumber?: number }
) {
    const { autoMigrations } = await getEnvVarsForDeployment(project, envTarget, context);
    return autoMigrations || [];
}

/**
 * Derive a branch-specific connection string for ephemeral environments
 */
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
    const snapshot = await db
        .collection(Collections.PROJECTS)
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
}

export async function getTeamMembership(teamId: string, userId: string): Promise<TeamMembership | null> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.TEAM_MEMBERSHIPS)
        .where('teamId', '==', teamId)
        .where('userId', '==', userId)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
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

export async function updateTeamMembership(id: string, data: Partial<TeamMembership>): Promise<void> {
    const db = getDb();
    await db.collection(Collections.TEAM_MEMBERSHIPS).doc(id).update(cleanFirestoreData(data));
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

export async function getProjectByRepoFullName(repoFullName: string): Promise<Project | null> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.PROJECTS)
        .where('repoFullName', '==', repoFullName)
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
