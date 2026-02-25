import { getDb, Collections } from '@/lib/firebase';
import type { User, Project, Deployment, Team, TeamMembership, TeamWithRole, TeamInvite, TeamRole, EnvVariable } from '@/types';
import { generateId } from '@/lib/utils';
import { decrypt } from '@/lib/crypto';
import type { QueryDocumentSnapshot, DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';

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

    await db.collection(Collections.USERS).doc(id).set(user);
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
    await db.collection(Collections.USERS).doc(id).update({
        ...data,
        updatedAt: new Date(),
    });
}

/**
 * Get environment variables for a deployment, handled filtering by environment/target and decryption
 */
export function getEnvVarsForDeployment(
    project: Project,
    envTarget: 'production' | 'preview'
): { buildEnvVars: Record<string, string>; runtimeEnvVars: Record<string, string> } {
    const envVars = project.envVariables || [];
    const buildEnvVars: Record<string, string> = {};
    const runtimeEnvVars: Record<string, string> = {};

    envVars.forEach((env: EnvVariable) => {
        // Filter by environment (Production vs Preview)
        if (env.environment && env.environment !== 'both' && env.environment !== envTarget) {
            return;
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
    });

    return { buildEnvVars, runtimeEnvVars };
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

    await db.collection(Collections.INVITES).doc(id).set(invite);
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
    batch.set(db.collection(Collections.TEAMS).doc(id), team);

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
    await db.collection(Collections.TEAM_MEMBERSHIPS).doc(id).update(data);
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listTeamsWithMembership(userId: string, dbClient?: any): Promise<TeamWithRole[]> {
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
        cloudRunServiceId: null,
        productionUrl: null,
        region: projectData.region ?? null, // Use provided region or default to null
        createdAt: now,
        updatedAt: now,
    };

    await db.collection(Collections.PROJECTS).doc(id).set(project);
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
    await db.collection(Collections.PROJECTS).doc(id).update({
        ...data,
        updatedAt: new Date(),
    });
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

    await db.collection(Collections.DEPLOYMENTS).doc(id).set(deployment);
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
    type?: 'production' | 'preview'
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
    await db.collection(Collections.DEPLOYMENTS).doc(id).update({
        ...data,
        updatedAt: new Date(),
    });
}
