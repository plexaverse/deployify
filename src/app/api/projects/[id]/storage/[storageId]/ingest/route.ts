import { NextResponse } from 'next/server';
import { getProjectById } from '@/lib/db';
import { ingestExternalToNative } from '@/lib/gcp/ingestion';

export async function POST(
    req: Request,
    { params }: { params: { id: string; storageId: string } }
) {
    try {
        const { id: projectId, storageId } = params;
        const body = await req.json();
        const { targetName, region, dbType, storageUri } = body;

        const project = await getProjectById(projectId);
        if (!project) {
            return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
        }

        const result = await ingestExternalToNative(projectId, storageId, project, {
            targetName,
            region,
            dbType: dbType || 'postgres',
            storageUri
        });

        if (!result.success) {
            return NextResponse.json(result, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('[API] Ingestion Error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
