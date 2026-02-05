import { getDb, Collections } from '@/lib/firebase';
import type { User, Project, Deployment, EnvVar } from '@/types';
import { generateId } from '@/lib/utils';

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


export async function upsertUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const existingUser = await getUserById(userData.githubId.toString());

    if (existingUser) {
        await updateUser(existingUser.id, userData);
        return { ...existingUser, ...userData, updatedAt: new Date() };
    }

    return createUser(userData);
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

// ============= Environment Variable Operations =============

export async function createEnvVar(
    envVarData: Omit<EnvVar, 'id' | 'createdAt' | 'updatedAt'>
): Promise<EnvVar> {
    const db = getDb();
    const id = generateId('env');
    const now = new Date();

    const envVar: EnvVar = {
        ...envVarData,
        id,
        createdAt: now,
        updatedAt: now,
    };

    await db.collection(Collections.ENV_VARS).doc(id).set(envVar);
    return envVar;
}

export async function listEnvVarsByProject(projectId: string): Promise<EnvVar[]> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.ENV_VARS)
        .where('projectId', '==', projectId)
        .orderBy('key')
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            createdAt: data?.createdAt?.toDate(),
            updatedAt: data?.updatedAt?.toDate(),
        } as EnvVar;
    });
}

export async function getEnvVarsForDeployment(
    projectId: string,
    target: 'production' | 'preview'
): Promise<Record<string, string>> {
    const envVars = await listEnvVarsByProject(projectId);

    const result: Record<string, string> = {};

    for (const envVar of envVars) {
        if (envVar.target === 'all' || envVar.target === target) {
            result[envVar.key] = envVar.value;
        }
    }

    return result;
}

export async function deleteEnvVar(id: string): Promise<void> {
    const db = getDb();
    await db.collection(Collections.ENV_VARS).doc(id).delete();
}

export async function updateEnvVar(id: string, data: Partial<EnvVar>): Promise<void> {
    const db = getDb();
    await db.collection(Collections.ENV_VARS).doc(id).update({
        ...data,
        updatedAt: new Date(),
    });
}
