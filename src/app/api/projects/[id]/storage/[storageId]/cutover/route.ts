import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { orchestrateCutover } from '@/lib/gcp/ingestion';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: projectId, storageId: targetStorageId } = await params;
        const access = await checkProjectAccess(session.user.id, projectId);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        if (access.role === 'viewer') {
            return NextResponse.json({ error: 'Forbidden: Viewers cannot trigger cutover' }, { status: 403 });
        }

        const body = await req.json();
        const { sourceStorageId } = body;

        if (!sourceStorageId) {
            return NextResponse.json({ error: 'Source storage ID is required' }, { status: 400 });
        }

        const result = await orchestrateCutover(projectId, sourceStorageId, targetStorageId, session.user.id);

        if (!result.success) {
            return NextResponse.json(result, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('[API] Cutover Error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
