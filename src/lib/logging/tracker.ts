import { getDb, Collections } from '@/lib/firebase';
import { generateId } from '@/lib/utils';

export interface ErrorEvent {
    id: string;
    projectId?: string;
    message: string;
    stack?: string;
    path?: string;
    method?: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

/**
 * Log an error to Firestore for tracking and observability
 */
export async function trackError(params: {
    message: string;
    projectId?: string;
    error?: unknown;
    path?: string;
    method?: string;
    metadata?: Record<string, unknown>;
}): Promise<string> {
    try {
        const db = getDb();
        const id = generateId('err');
        const now = new Date();

        const error = params.error instanceof Error ? params.error : null;

        const event: ErrorEvent = {
            id,
            projectId: params.projectId,
            message: params.message || error?.message || 'Unknown error',
            stack: error?.stack,
            path: params.path,
            method: params.method,
            timestamp: now,
            metadata: params.metadata,
        };

        // Also log to console for development/system logs
        console.error(`[Error Tracker] ${event.id}: ${event.message}`, {
            path: event.path,
            method: event.method,
            projectId: event.projectId
        });

        await db.collection(Collections.ERRORS).doc(id).set(event);
        return id;
    } catch (e) {
        // Fallback to console if Firestore fails
        console.error('Failed to log error to tracker:', e);
        return 'failed-to-log';
    }
}
