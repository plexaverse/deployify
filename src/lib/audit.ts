import { getDb as defaultGetDb, Collections } from '@/lib/firebase';
import { generateId } from '@/lib/utils';

export interface AuditEvent {
    id: string;
    teamId: string | null;
    userId: string;
    action: string;
    details: Record<string, any>;
    createdAt: Date;
}

export async function logAuditEvent(
    teamId: string | null,
    userId: string,
    action: string,
    details: Record<string, any>
): Promise<void> {
    const db = defaultGetDb();
    const id = generateId('audit');
    const now = new Date();

    const event: AuditEvent = {
        id,
        teamId,
        userId,
        action,
        details,
        createdAt: now,
    };

    await db.collection(Collections.AUDIT_LOGS).doc(id).set(event);
}

export async function listAuditLogs(
    teamId: string,
    limit: number = 50,
    // Dependency Injection for testing
    getDbImpl = defaultGetDb
): Promise<AuditEvent[]> {
    const db = getDbImpl();
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
