import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getDb, Collections } from '@/lib/firebase';
import { maskEmail } from '@/lib/utils/masking';

/**
 * GET - Fetch compliance audit logs for a specific storage connector
 * This returns query logs across ALL users for compliance monitoring
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        // Only owners and admins can view the full audit trail
        if (access.role === 'viewer') {
            return NextResponse.json({ error: 'Forbidden: Viewers cannot access audit logs' }, { status: 403 });
        }

        if (process.env.MOCK_DB === 'true') {
            return NextResponse.json({
                success: true,
                auditLogs: [
                    {
                        id: 'a1',
                        userId: 'u1',
                        userEmail: 'admin@deployify.app',
                        query: 'SELECT * FROM secrets',
                        timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
                        masked: true
                    },
                    {
                        id: 'a2',
                        userId: 'u2',
                        userEmail: 'dev@deployify.app',
                        query: 'DELETE FROM users WHERE id = 1',
                        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
                        masked: false
                    },
                ]
            });
        }

        const db = getDb();
        const auditSnapshot = await db
            .collection(Collections.DATA_LAB_AUDIT)
            .where('projectId', '==', id)
            .where('storageId', '==', storageId)
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        const auditLogs = auditSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                userEmail: data.userEmail ? maskEmail(data.userEmail) : 'anonymous',
                timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp
            };
        });

        return NextResponse.json({ success: true, auditLogs });
    } catch (error) {
        console.error('Failed to fetch audit logs:', error);
        return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
    }
}
