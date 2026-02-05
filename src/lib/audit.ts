import { getDb, Collections } from '@/lib/firebase';
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
    const db = getDb();
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
