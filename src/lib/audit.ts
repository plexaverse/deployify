import { getDb, Collections } from '@/lib/firebase';
import { generateId } from '@/lib/utils';

export interface AuditEvent {
    id: string;
    teamId: string | null;
    projectId?: string | null;
    userId: string;
    action: string;
    details: Record<string, any>;
    createdAt: Date;
}

export async function logAuditEvent(
    teamId: string | null,
    userId: string,
    action: string,
    details: Record<string, any>,
    projectId?: string
): Promise<void> {
    const db = getDb();
    const id = generateId('audit');
    const now = new Date();

    const event: AuditEvent = {
        id,
        teamId,
        projectId: projectId || null,
        userId,
        action,
        details,
        createdAt: now,
    };

    await db.collection(Collections.AUDIT_LOGS).doc(id).set(event);
}

export async function listAuditLogs(
    teamId: string,
    limit: number = 20
): Promise<AuditEvent[]> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.AUDIT_LOGS)
        .where('teamId', '==', teamId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            createdAt: data?.createdAt?.toDate(),
        } as AuditEvent;
    });
}

export async function listProjectAuditLogs(
    projectId: string,
    limit: number = 20
): Promise<AuditEvent[]> {
    const db = getDb();
    const snapshot = await db
        .collection(Collections.AUDIT_LOGS)
        .where('projectId', '==', projectId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            createdAt: data?.createdAt?.toDate(),
        } as AuditEvent;
    });
}
